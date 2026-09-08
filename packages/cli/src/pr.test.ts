import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseLock, PR_COMMENT_MARKER } from '@ruleprint/core';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');
const TIMEOUT = 90_000;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs the CLI asynchronously: the fake GitHub API lives in this process, so a synchronous spawn
 * would block the event loop and deadlock the child's requests.
 */
function ruleprint(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolveRun, reject) => {
    // The Action's variables come only from `env`: none may leak from the developer's shell.
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GITHUB_')),
    );
    const child = spawn(TSX, [join(import.meta.dirname, 'bin.ts'), ...args], {
      cwd,
      env: { ...inherited, NODE_OPTIONS: '--conditions=ruleprint-source', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolveRun({ status, stdout, stderr }));
  });
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A pull request event as the Action receives it. */
function pullRequestEvent(headRepo = 'o/r'): unknown {
  return {
    action: 'synchronize',
    number: 7,
    pull_request: {
      number: 7,
      head: { ref: 'feature', sha: 'a'.repeat(40), repo: { full_name: headRepo } },
    },
    repository: { full_name: 'o/r' },
  };
}

function commentEvent(body: string, login = 'maria'): unknown {
  return {
    action: 'edited',
    issue: { number: 7, pull_request: { url: 'x' } },
    comment: { id: 42, body },
    sender: { login, type: 'User' },
  };
}

interface Recorded {
  method: string;
  path: string;
  body?: { body?: string };
}

interface FakeGitHub {
  url: string;
  requests: Recorded[];
  comments: Map<number, string>;
  headRef: string;
  headRepo: string;
  permission: string;
  forbidWrites: boolean;
  close(): Promise<void>;
}

async function fakeGitHub(): Promise<FakeGitHub> {
  const fake: FakeGitHub = {
    url: '',
    requests: [],
    comments: new Map(),
    headRef: 'feature',
    headRepo: 'o/r',
    permission: 'write',
    forbidWrites: false,
    close: () => Promise.resolve(),
  };
  let nextId = 100;
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const method = req.method ?? '';
      const path = (req.url ?? '').replace(/\?.*$/, '');
      const body = raw === '' ? undefined : (JSON.parse(raw) as { body?: string });
      fake.requests.push({ method, path, ...(body && { body }) });
      const respond = (status: number, payload: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (fake.forbidWrites && method !== 'GET') {
        respond(403, { message: 'Resource not accessible by integration' });
        return;
      }
      const comment = /^\/repos\/o\/r\/issues\/comments\/(\d+)$/.exec(path);
      if (method === 'GET' && path === '/repos/o/r/issues/7/comments') {
        respond(
          200,
          [...fake.comments].map(([id, text]) => ({ id, body: text })),
        );
      } else if (method === 'POST' && path === '/repos/o/r/issues/7/comments') {
        const id = nextId++;
        fake.comments.set(id, body?.body ?? '');
        respond(201, { id, body: body?.body });
      } else if (method === 'PATCH' && comment?.[1] !== undefined) {
        const id = Number(comment[1]);
        if (!fake.comments.has(id)) {
          respond(404, { message: 'Not Found' });
          return;
        }
        fake.comments.set(id, body?.body ?? '');
        respond(200, { id, body: body?.body });
      } else if (method === 'GET' && path === '/repos/o/r/pulls/7') {
        respond(200, {
          number: 7,
          head: { ref: fake.headRef, sha: 'b'.repeat(40), repo: { full_name: fake.headRepo } },
        });
      } else if (
        method === 'GET' &&
        /^\/repos\/o\/r\/collaborators\/[^/]+\/permission$/.test(path)
      ) {
        respond(200, { permission: fake.permission });
      } else {
        respond(404, { message: `no route for ${method} ${path}` });
      }
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise((resolveClose) => server.close(() => resolveClose()));
  return fake;
}

function writeEvent(dir: string, name: string, payload: unknown): Record<string, string> {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(payload));
  return { GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: file };
}

function actionEnv(
  fake: FakeGitHub | undefined,
  event: Record<string, string>,
): Record<string, string> {
  return {
    ...event,
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_SERVER_URL: 'https://github.example',
    ...(fake && { GITHUB_TOKEN: 't', GITHUB_API_URL: fake.url }),
  };
}

function scratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `ruleprint-${prefix}-`));
}

/** A copy of the fixture outside any git repository, without its lock. */
function looseFixture(dir: string, withLock = false): string {
  const target = join(dir, 'fixture');
  cpSync(FIXTURE, target, {
    recursive: true,
    filter: (src) => withLock || !src.endsWith('ruleprint.lock'),
  });
  return target;
}

/**
 * The dogfood layout: `work/` is a repository with the fixture under
 * `examples/fixture-express-api` (no lock) on branch `feature`, pushed to `bare.git`, and
 * `runner/` is a second clone checked out at `main`, like the Action's checkout.
 */
function dogfoodRepos(dir: string): { work: string; bare: string; runner: string } {
  const work = join(dir, 'work');
  const bare = join(dir, 'bare.git');
  const runner = join(dir, 'runner');
  mkdirSync(work, { recursive: true });
  git(work, ['init', '-q', '-b', 'main']);
  git(work, ['config', 'user.email', 'dev@example.com']);
  git(work, ['config', 'user.name', 'Dev']);
  writeFileSync(join(work, 'README.md'), '# dogfood\n');
  git(work, ['add', '.']);
  git(work, ['commit', '-q', '-m', 'chore: main']);
  git(work, ['checkout', '-q', '-b', 'feature']);
  cpSync(FIXTURE, join(work, 'examples/fixture-express-api'), {
    recursive: true,
    filter: (src) => !src.endsWith('ruleprint.lock'),
  });
  git(work, ['add', '.']);
  git(work, ['commit', '-q', '-m', 'feat: fixture']);
  git(dir, ['init', '-q', '--bare', 'bare.git']);
  git(work, ['remote', 'add', 'origin', bare]);
  git(work, ['push', '-q', 'origin', 'main', 'feature']);
  git(dir, ['clone', '-q', '--branch', 'main', bare, 'runner']);
  return { work, bare, runner };
}

function tickedBody(ids: string[], all = false): string {
  return [
    PR_COMMENT_MARKER,
    `- [${all ? 'x' : ' '}] **Approve all** (21 changes)`,
    ...ids.map((id) => `- [x] **${id}** title`),
  ].join('\n');
}

async function pendingIds(cwd: string): Promise<string[]> {
  const run = await ruleprint(cwd, ['check', '--json']);
  return (JSON.parse(run.stdout) as { changes: { id: string }[] }).changes.map((c) => c.id);
}

let fake: FakeGitHub | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

describe('ruleprint pr', () => {
  it(
    '--dry-run prints the comment and exits like check without touching the network',
    async () => {
      const dir = scratch('dry');
      const fixture = looseFixture(dir);
      const env = actionEnv(undefined, writeEvent(dir, 'pull_request', pullRequestEvent()));
      const run = await ruleprint(fixture, ['pr', '--dry-run'], env);
      expect(run.status).toBe(1);
      expect(run.stdout.startsWith(`${PR_COMMENT_MARKER}\n`)).toBe(true);
      expect(run.stdout).toContain('**21 changes need approval**');
      expect(run.stdout).toContain('- [ ] **Approve all** (21 changes)');
      expect(run.stdout).toContain('- [ ] **RP-');
      expect(run.stdout).toContain('https://github.example/o/r/blob/aaaaaaa');
      expect(run.stdout).toContain('### Orphans (1)');
      const lenient = await ruleprint(fixture, ['pr', '--dry-run', '--no-fail-on-changes'], env);
      expect(lenient.status).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'creates one comment, updates it on the next run and reports when everything is approved',
    async () => {
      fake = await fakeGitHub();
      const dir = scratch('report');
      const fixture = looseFixture(dir);
      const env = actionEnv(fake, writeEvent(dir, 'pull_request', pullRequestEvent()));

      const first = await ruleprint(fixture, ['pr'], env);
      expect(first.status).toBe(1);
      expect(fake.requests.map((r) => r.method)).toEqual(['GET', 'POST']);
      expect(fake.comments.size).toBe(1);
      const [created] = [...fake.comments];
      if (!created) throw new Error('expected a comment');
      const [id, body] = created;
      expect(body).toContain('**21 changes need approval**');

      const second = await ruleprint(fixture, ['pr'], env);
      expect(second.status).toBe(1);
      expect(fake.requests.slice(2).map((r) => r.method)).toEqual(['GET']);
      expect(second.stderr).toContain('unchanged');

      expect((await ruleprint(fixture, ['approve', '--all', '--by', 'test:me'])).status).toBe(0);
      const third = await ruleprint(fixture, ['pr'], env);
      expect(third.status).toBe(0);
      expect(fake.requests.slice(3).map((r) => [r.method, r.path])).toEqual([
        ['GET', '/repos/o/r/issues/7/comments'],
        ['PATCH', `/repos/o/r/issues/comments/${id}`],
      ]);
      expect(fake.comments.get(id)).toContain('✔ All 20 rules approved. Nothing to review.');
      expect(fake.comments.get(id)).toContain('### Orphans (1)');
    },
    TIMEOUT,
  );

  it(
    'posts nothing on a clean pull request',
    async () => {
      fake = await fakeGitHub();
      const dir = scratch('clean');
      const fixture = looseFixture(dir, true);
      const env = actionEnv(fake, writeEvent(dir, 'pull_request', pullRequestEvent()));
      const run = await ruleprint(fixture, ['pr'], env);
      expect(run.status).toBe(0);
      expect(fake.requests.map((r) => r.method)).toEqual(['GET']);
      expect(run.stderr).toContain('nothing to report');
    },
    TIMEOUT,
  );

  it(
    'degrades to the log on a fork, where the token cannot comment',
    async () => {
      fake = await fakeGitHub();
      fake.forbidWrites = true;
      const dir = scratch('fork');
      const fixture = looseFixture(dir);
      const env = actionEnv(fake, writeEvent(dir, 'pull_request', pullRequestEvent('x/r')));
      const run = await ruleprint(fixture, ['pr'], env);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('cannot comment');
      expect(run.stdout).toMatch(/^\+ RP-\d{6}\s+added/m);
      const attempted = fake.requests.find((r) => r.method === 'POST');
      expect(attempted?.body?.body).not.toContain('[ ]');
      expect(attempted?.body?.body).toContain('Checkbox approval works only for branches');
    },
    TIMEOUT,
  );

  it(
    'approves the ticked ids, commits the lock to the branch and refreshes the comment',
    async () => {
      fake = await fakeGitHub();
      const dir = scratch('approve');
      const { bare, runner } = dogfoodRepos(dir);
      const ids = (
        await pendingIds(join(runner, '..', 'work', 'examples/fixture-express-api'))
      ).slice(0, 2);
      expect(ids).toHaveLength(2);
      fake.comments.set(42, tickedBody(ids));
      const env = actionEnv(fake, writeEvent(dir, 'issue_comment', commentEvent(tickedBody(ids))));

      const run = await ruleprint(runner, ['pr', '--dir', 'examples/fixture-express-api'], env);
      expect(run.stderr).not.toContain('ruleprint:');
      expect(run.stderr).toContain('approved 2 rule(s)');
      expect(run.status).toBe(0);

      const lock = parseLock(
        readFileSync(join(runner, 'examples/fixture-express-api/ruleprint.lock'), 'utf8'),
      );
      expect(Object.keys(lock.rules).sort()).toEqual([...ids].sort());
      expect(Object.values(lock.rules).every((e) => e.approvedBy === 'github:maria')).toBe(true);

      expect(git(bare, ['log', '-1', '--format=%s', 'feature'])).toBe(
        'chore(ruleprint): approve 2 rules',
      );
      expect(git(bare, ['log', '-1', '--format=%an <%ae>', 'feature'])).toBe(
        'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
      );
      expect(git(bare, ['log', '-1', '--format=%b', 'feature'])).toContain(
        'Approved-by: github:maria',
      );
      expect(git(bare, ['show', '--stat', '--format=', 'feature'])).toContain(
        'examples/fixture-express-api/ruleprint.lock',
      );
      expect(git(bare, ['show', '--stat', '--format=', 'feature'])).not.toContain('ruleprint.json');

      const patched = fake.requests.filter((r) => r.method === 'PATCH');
      expect(patched).toHaveLength(1);
      const body = fake.comments.get(42) ?? '';
      expect(body).toContain('**19 changes need approval** · 2 approved');
      expect(body).toContain(`> Approved ${ids.join(', ')} (commit `);
      expect(body).not.toContain('[x]');
      for (const id of ids) expect(body).not.toContain(`**${id}**`);
    },
    TIMEOUT,
  );

  it(
    'approves everything when the approve-all box is ticked',
    async () => {
      fake = await fakeGitHub();
      const dir = scratch('all');
      const { bare, runner } = dogfoodRepos(dir);
      fake.comments.set(42, tickedBody([], true));
      const env = actionEnv(
        fake,
        writeEvent(dir, 'issue_comment', commentEvent(tickedBody([], true))),
      );
      const run = await ruleprint(runner, ['pr', '--dir', 'examples/fixture-express-api'], env);
      expect(run.status).toBe(0);
      expect(git(bare, ['log', '-1', '--format=%s', 'feature'])).toBe(
        'chore(ruleprint): approve 21 rules',
      );
      expect(fake.comments.get(42)).toContain('✔ All 20 rules approved.');
    },
    TIMEOUT,
  );

  it(
    '--no-push commits on the current branch without fetching or pushing',
    async () => {
      fake = await fakeGitHub();
      const dir = scratch('nopush');
      const { work, bare } = dogfoodRepos(dir);
      const before = git(bare, ['rev-parse', 'feature']);
      const ids = (await pendingIds(join(work, 'examples/fixture-express-api'))).slice(0, 1);
      fake.comments.set(42, tickedBody(ids));
      const env = actionEnv(fake, writeEvent(dir, 'issue_comment', commentEvent(tickedBody(ids))));
      const run = await ruleprint(
        work,
        ['pr', '--dir', 'examples/fixture-express-api', '--no-push'],
        env,
      );
      expect(run.status).toBe(0);
      expect(git(work, ['log', '-1', '--format=%s'])).toBe('chore(ruleprint): approve 1 rule');
      expect(git(bare, ['rev-parse', 'feature'])).toBe(before);
    },
    TIMEOUT,
  );

  it(
    'refuses an editor without write access',
    async () => {
      fake = await fakeGitHub();
      fake.permission = 'read';
      const dir = scratch('perm');
      const { bare, runner } = dogfoodRepos(dir);
      const before = git(bare, ['rev-parse', 'feature']);
      fake.comments.set(42, tickedBody(['RP-000001']));
      const env = actionEnv(
        fake,
        writeEvent(dir, 'issue_comment', commentEvent(tickedBody(['RP-000001']), 'eve')),
      );
      const run = await ruleprint(runner, ['pr', '--dir', 'examples/fixture-express-api'], env);
      expect(run.status).toBe(0);
      expect(git(bare, ['rev-parse', 'feature'])).toBe(before);
      expect(fake.comments.get(42)).toContain(
        '> @eve does not have write access to this repository.',
      );
      expect(fake.comments.get(42)).toContain('- [ ] **RP-');
    },
    TIMEOUT,
  );

  it(
    'drops ticked ids that are no longer pending and approves the rest',
    async () => {
      fake = await fakeGitHub();
      const dir = scratch('stale');
      const { bare, runner } = dogfoodRepos(dir);
      const [real] = await pendingIds(join(runner, '..', 'work', 'examples/fixture-express-api'));
      const ids = [real ?? '', 'RP-999999'];
      fake.comments.set(42, tickedBody(ids));
      const env = actionEnv(fake, writeEvent(dir, 'issue_comment', commentEvent(tickedBody(ids))));
      const run = await ruleprint(runner, ['pr', '--dir', 'examples/fixture-express-api'], env);
      expect(run.status).toBe(0);
      expect(git(bare, ['log', '-1', '--format=%s', 'feature'])).toBe(
        'chore(ruleprint): approve 1 rule',
      );
      expect(fake.comments.get(42)).toContain('RP-999999 is no longer pending');
    },
    TIMEOUT,
  );

  it(
    'exits 2 naming the missing variable',
    async () => {
      const dir = scratch('env');
      const fixture = looseFixture(dir);
      const event = writeEvent(dir, 'pull_request', pullRequestEvent());
      const noToken = await ruleprint(fixture, ['pr'], { ...event, GITHUB_REPOSITORY: 'o/r' });
      expect(noToken.status).toBe(2);
      expect(noToken.stderr).toContain('GITHUB_TOKEN');
      const noEvent = await ruleprint(fixture, ['pr', '--dry-run'], {
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_EVENT_NAME: 'pull_request',
      });
      expect(noEvent.status).toBe(2);
      expect(noEvent.stderr).toContain('GITHUB_EVENT_PATH');
    },
    TIMEOUT,
  );

  it(
    'skips events it does not handle',
    async () => {
      const dir = scratch('skip');
      const fixture = looseFixture(dir);
      const run = await ruleprint(
        fixture,
        ['pr', '--dry-run'],
        actionEnv(undefined, writeEvent(dir, 'push', { ref: 'refs/heads/main' })),
      );
      expect(run.status).toBe(0);
      expect(run.stderr).toContain('event push is not handled');
    },
    TIMEOUT,
  );
});
