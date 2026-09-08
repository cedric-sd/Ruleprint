import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  exitCodeFor,
  orphansOf,
  PR_COMMENT_DEFAULT_LIMIT,
  PR_COMMENT_MARKER,
  renderPrComment,
  type Change,
  type PrCommentInput,
  type PrCommentSource,
} from '@ruleprint/core';
import type { RulePrintDocument } from '@ruleprint/spec';

import { approveProject } from './approve.js';
import { commitPaths, fetchAndCheckout, isTracked, pathPrefixInRepo, pushBranch } from './git.js';
import { createGitHubClient, GitHubError, type GitHubClient, type IssueComment } from './github.js';
import { decidePrAction, type PrAction } from './pr-event.js';
import { countApproved, describeChange } from './report.js';
import { scanProject, type ScanResult } from './scan.js';

export interface PrOptions {
  /** Directory to scan (repository root or a subdirectory). */
  readonly dir: string;
  /**
   * Where git runs before the pull request branch is checked out (default: `process.cwd()`).
   * `dir` may not exist yet on the default branch.
   */
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Print the comment instead of talking to GitHub. */
  readonly dryRun?: boolean;
  /** `false`: commit approvals on the current branch without fetching or pushing. */
  readonly push?: boolean;
  /** `false`: exit 0 even when rules need approval (default: like `check`). */
  readonly failOnChanges?: boolean;
  readonly limit?: number;
  readonly now?: Date;
  readonly version?: string;
  readonly log?: (line: string) => void;
  /** Where the report goes when the comment cannot be posted (default: stdout). */
  readonly out?: (line: string) => void;
  readonly fetch?: typeof fetch;
}

export interface PrResult {
  readonly action: PrAction['kind'];
  readonly reason?: string;
  readonly body?: string;
  readonly changes: readonly Change[];
  readonly comment?: 'created' | 'updated' | 'unchanged' | 'not-needed' | 'forbidden';
  readonly approved?: readonly string[];
  readonly commit?: string;
  readonly exitCode: 0 | 1;
}

const BOT_IDENTITY = {
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com',
};
const WRITE_PERMISSIONS = new Set(['admin', 'write', 'maintain']);

function required(env: PrOptions['env'], name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

function readEvent(env: PrOptions['env']): { name: string; payload: unknown } {
  const name = required(env, 'GITHUB_EVENT_NAME');
  const path = required(env, 'GITHUB_EVENT_PATH');
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read GITHUB_EVENT_PATH (${path}): ${String(error)}`, { cause: error });
  }
  return { name, payload };
}

function sourcesOf(document: RulePrintDocument): Record<string, PrCommentSource> {
  const sources: Record<string, PrCommentSource> = {};
  for (const rule of document.rules) {
    const first = rule.origin.sources[0];
    if (first)
      sources[rule.id] = {
        file: first.file,
        ...(first.line !== undefined && { line: first.line }),
      };
  }
  return sources;
}

function directoryOf(dir: string): string | undefined {
  const prefix = pathPrefixInRepo(dir).replace(/\/+$/, '');
  return prefix === '' ? undefined : prefix;
}

function commentInput(
  scan: ScanResult,
  options: PrOptions,
  extra: Pick<PrCommentInput, 'blobUrl' | 'canApprove' | 'note' | 'commit'>,
): PrCommentInput {
  const document = scan.document;
  return {
    changes: scan.changes,
    orphans: orphansOf(document).map((rule) => ({ id: rule.id, title: rule.title })),
    approved: countApproved(document),
    sources: sourcesOf(document),
    canApprove: extra.canApprove,
    ...(extra.blobUrl !== undefined && { blobUrl: extra.blobUrl }),
    ...(extra.note !== undefined && { note: extra.note }),
    ...(extra.commit !== undefined && { commit: extra.commit }),
    ...(options.version !== undefined && { version: options.version }),
    limit: options.limit ?? PR_COMMENT_DEFAULT_LIMIT,
    ...(directoryOf(options.dir) !== undefined && { directory: directoryOf(options.dir) }),
  };
}

function clientFor(options: PrOptions): GitHubClient {
  return createGitHubClient({
    baseUrl: options.env['GITHUB_API_URL'] ?? 'https://api.github.com',
    token: required(options.env, 'GITHUB_TOKEN'),
    repo: required(options.env, 'GITHUB_REPOSITORY'),
    userAgent: `ruleprint/${options.version ?? 'dev'}`,
    ...(options.fetch && { fetch: options.fetch }),
  });
}

async function findBotComment(
  client: GitHubClient,
  number: number,
): Promise<IssueComment | undefined> {
  const comments = await client.listIssueComments(number);
  return comments.find((comment) => comment.body.includes(PR_COMMENT_MARKER));
}

async function report(
  action: Extract<PrAction, { kind: 'report' }>,
  options: PrOptions,
  log: (line: string) => void,
): Promise<PrResult> {
  const scan = await scanProject(resolve(options.dir), {
    ...(options.now && { now: options.now }),
  });
  for (const warning of scan.warnings) log(`warning: ${warning}`);
  const server = options.env['GITHUB_SERVER_URL'] ?? 'https://github.com';
  const repo = options.env['GITHUB_REPOSITORY'];
  const body = renderPrComment(
    commentInput(scan, options, {
      canApprove: !action.fork,
      commit: action.headSha,
      ...(repo !== undefined && { blobUrl: `${server}/${repo}/blob/${action.headSha}` }),
    }),
  );
  const exitCode = options.failOnChanges === false ? 0 : exitCodeFor(scan.changes);
  if (options.dryRun) return { action: 'report', body, changes: scan.changes, exitCode };

  const client = clientFor(options);
  let comment: NonNullable<PrResult['comment']>;
  try {
    const existing = await findBotComment(client, action.number);
    if (existing) {
      if (existing.body === body) {
        comment = 'unchanged';
      } else {
        await client.updateIssueComment(existing.id, body);
        comment = 'updated';
      }
    } else if (scan.changes.length > 0) {
      await client.createIssueComment(action.number, body);
      comment = 'created';
    } else {
      comment = 'not-needed';
    }
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 404))
      throw error;
    comment = 'forbidden';
    log(
      `warning: cannot comment on the pull request (${error.message}); printing the report instead`,
    );
    const out = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
    for (const change of scan.changes) out(describeChange(change));
  }
  log(
    comment === 'not-needed'
      ? 'nothing to report: no changes and no comment yet'
      : `comment ${comment} (${scan.changes.length} change(s))`,
  );
  return { action: 'report', body, changes: scan.changes, comment, exitCode };
}

async function refresh(
  client: GitHubClient,
  commentId: number,
  scan: ScanResult,
  options: PrOptions,
  extra: Pick<PrCommentInput, 'canApprove' | 'note' | 'commit'>,
): Promise<string> {
  const server = options.env['GITHUB_SERVER_URL'] ?? 'https://github.com';
  const repo = options.env['GITHUB_REPOSITORY'];
  const body = renderPrComment(
    commentInput(scan, options, {
      ...extra,
      ...(repo !== undefined &&
        extra.commit !== undefined && { blobUrl: `${server}/${repo}/blob/${extra.commit}` }),
    }),
  );
  await client.updateIssueComment(commentId, body);
  return body;
}

async function approve(
  action: Extract<PrAction, { kind: 'approve' }>,
  options: PrOptions,
  log: (line: string) => void,
): Promise<PrResult> {
  const client = clientFor(options);
  const dir = resolve(options.dir);
  const gitDir = existsSync(dir) ? dir : (options.cwd ?? process.cwd());
  const scanOptions = { ...(options.now && { now: options.now }) };
  const pull = await client.getPullRequest(action.number);
  const repo = options.env['GITHUB_REPOSITORY'];
  const fork = pull.head.repo === null || pull.head.repo.full_name !== repo;

  const refuse = async (note: string, canApprove: boolean): Promise<PrResult> => {
    log(`refused: ${note}`);
    if (options.push !== false && !fork) fetchAndCheckout(gitDir, pull.head.ref);
    const scan = await scanProject(dir, scanOptions);
    const body = await refresh(client, action.commentId, scan, options, {
      canApprove,
      note,
      commit: pull.head.sha,
    });
    return {
      action: 'approve',
      reason: note,
      body,
      changes: scan.changes,
      comment: 'updated',
      exitCode: 0,
    };
  };

  if (fork) {
    return refuse('Checkbox approval works only for branches of this repository.', false);
  }
  const permission = await client.getPermission(action.login);
  if (!WRITE_PERMISSIONS.has(permission)) {
    return refuse(`@${action.login} does not have write access to this repository.`, true);
  }

  if (options.push !== false) fetchAndCheckout(gitDir, pull.head.ref);
  const scan = await scanProject(dir, scanOptions);
  const pending = new Set(scan.changes.map((change) => change.id));
  const stale = action.all ? [] : action.ids.filter((id) => !pending.has(id));
  const ids = action.all
    ? scan.changes.map((change) => change.id)
    : action.ids.filter((id) => pending.has(id));
  const staleNote =
    stale.length > 0
      ? ` ${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} no longer pending.`
      : '';
  if (ids.length === 0) {
    return refuse(`Nothing to approve.${staleNote}`.trim(), true);
  }

  const result = await approveProject(dir, {
    ...(action.all ? { all: true } : { ids }),
    approvedBy: `github:${action.login}`,
    ...(options.now && { now: options.now }),
    scanOptions,
  });
  const approved = result.applied.map((change) => change.id);
  const paths = ['ruleprint.lock', ...(isTracked(dir, 'ruleprint.json') ? ['ruleprint.json'] : [])];
  const message = [
    `chore(ruleprint): approve ${approved.length} rule${approved.length === 1 ? '' : 's'}`,
    '',
    approved.join(', '),
    '',
    `Approved-by: github:${action.login}`,
  ].join('\n');
  const commit = commitPaths(dir, paths, message, BOT_IDENTITY);
  if (commit !== undefined && options.push !== false) pushBranch(dir, pull.head.ref);
  log(
    commit === undefined
      ? `approved ${approved.length} rule(s); the lock did not change`
      : `approved ${approved.length} rule(s) in ${commit.slice(0, 7)}${options.push === false ? '' : ` → ${pull.head.ref}`}`,
  );

  const after = await scanProject(dir, scanOptions);
  const note = `Approved ${approved.join(', ')}${commit === undefined ? '' : ` (commit ${commit.slice(0, 7)})`}.${staleNote}`;
  const body = await refresh(client, action.commentId, after, options, {
    canApprove: true,
    note,
    commit: commit ?? pull.head.sha,
  });
  return {
    action: 'approve',
    body,
    changes: after.changes,
    comment: 'updated',
    approved,
    ...(commit !== undefined && { commit }),
    exitCode: 0,
  };
}

/** `ruleprint pr`: comments on the pull request or approves from its ticked boxes (ADR-0008). */
export async function runPr(options: PrOptions): Promise<PrResult> {
  const log = options.log ?? (() => undefined);
  const event = readEvent(options.env);
  const action = decidePrAction(event.name, event.payload);
  if (action.kind === 'skip') {
    log(`skipped: ${action.reason}`);
    return { action: 'skip', reason: action.reason, changes: [], exitCode: 0 };
  }
  if (action.kind === 'report') return report(action, options, log);
  if (options.dryRun) {
    throw new Error('--dry-run cannot approve; run it on a pull_request event');
  }
  return approve(action, options, log);
}
