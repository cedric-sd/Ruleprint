import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createGitHubClient, GitHubError } from './github.js';

interface Recorded {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

let server: Server;
let baseUrl: string;
let requests: Recorded[] = [];
let failNext: { status: number; message: string } | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const path = req.url ?? '';
      requests.push({
        method: req.method ?? '',
        path,
        headers: req.headers,
        body: raw === '' ? undefined : JSON.parse(raw),
      });
      if (failNext) {
        res.writeHead(failNext.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: failNext.message }));
        failNext = undefined;
        return;
      }
      const respond = (status: number, body: unknown, extra: Record<string, string> = {}): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...extra });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && path.startsWith('/repos/o/r/issues/7/comments')) {
        const page = new URL(path, baseUrl).searchParams.get('page') ?? '1';
        if (page === '1') {
          respond(200, [{ id: 1, body: 'one' }], {
            link: `<${baseUrl}/repos/o/r/issues/7/comments?per_page=100&page=2>; rel="next"`,
          });
        } else {
          respond(200, [{ id: 2, body: 'two' }]);
        }
        return;
      }
      if (req.method === 'POST' && path === '/repos/o/r/issues/7/comments') {
        respond(201, { id: 99, body: (JSON.parse(raw) as { body: string }).body });
        return;
      }
      if (req.method === 'PATCH' && path === '/repos/o/r/issues/comments/42') {
        respond(200, { id: 42, body: (JSON.parse(raw) as { body: string }).body });
        return;
      }
      if (req.method === 'GET' && path === '/repos/o/r/pulls/7') {
        respond(200, {
          number: 7,
          head: { ref: 'feature', sha: 'abc', repo: { full_name: 'o/r' } },
        });
        return;
      }
      if (req.method === 'GET' && path === '/repos/o/r/collaborators/maria/permission') {
        respond(200, { permission: 'write' });
        return;
      }
      respond(404, { message: 'Not Found' });
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});

beforeEach(() => {
  requests = [];
  failNext = undefined;
});

const client = () =>
  createGitHubClient({
    baseUrl: `${baseUrl}/`,
    token: 't',
    repo: 'o/r',
    userAgent: 'ruleprint/0.0.0',
  });

describe('createGitHubClient()', () => {
  it('lists issue comments across pages with the GitHub headers', async () => {
    const comments = await client().listIssueComments(7);
    expect(comments).toEqual([
      { id: 1, body: 'one' },
      { id: 2, body: 'two' },
    ]);
    expect(requests.map((r) => r.path)).toEqual([
      '/repos/o/r/issues/7/comments?per_page=100',
      '/repos/o/r/issues/7/comments?per_page=100&page=2',
    ]);
    const headers = requests[0]?.headers;
    expect(headers?.authorization).toBe('Bearer t');
    expect(headers?.accept).toBe('application/vnd.github+json');
    expect(headers?.['x-github-api-version']).toBe('2022-11-28');
    expect(headers?.['user-agent']).toBe('ruleprint/0.0.0');
  });

  it('creates and updates comments', async () => {
    expect(await client().createIssueComment(7, 'hello')).toEqual({ id: 99, body: 'hello' });
    expect(await client().updateIssueComment(42, 'edited')).toEqual({ id: 42, body: 'edited' });
    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual([
      ['POST', '/repos/o/r/issues/7/comments', { body: 'hello' }],
      ['PATCH', '/repos/o/r/issues/comments/42', { body: 'edited' }],
    ]);
  });

  it('reads the pull request head and a collaborator permission', async () => {
    expect(await client().getPullRequest(7)).toEqual({
      number: 7,
      head: { ref: 'feature', sha: 'abc', repo: { full_name: 'o/r' } },
    });
    expect(await client().getPermission('maria')).toBe('write');
  });

  it('throws a GitHubError with the status and message on failure', async () => {
    failNext = { status: 403, message: 'Resource not accessible by integration' };
    const error = await client()
      .createIssueComment(7, 'x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).status).toBe(403);
    expect((error as GitHubError).message).toContain('Resource not accessible');
    expect((error as GitHubError).message).toContain('POST /repos/o/r/issues/7/comments');
  });
});
