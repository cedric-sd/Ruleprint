import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { applyApprovals, type Change, type LockFile } from '@ruleprint/core';
import type { RulePrintDocument } from '@ruleprint/spec';

import { writeLock } from './lock-io.js';
import { scanProject, serializeDocument, type ScanOptions, type ScanResult } from './scan.js';

export interface ApproveProjectOptions {
  readonly all?: boolean;
  readonly ids?: readonly string[];
  readonly approvedBy?: string;
  readonly now?: Date;
  readonly scanOptions?: ScanOptions;
  /** Where to write the refreshed document (default `<dir>/ruleprint.json`). */
  readonly out?: string;
}

export interface ApproveResult {
  readonly lock: LockFile;
  readonly document: RulePrintDocument;
  /** The changes that were approved. */
  readonly applied: readonly Change[];
  /** The scan the approvals were computed from. */
  readonly scan: ScanResult;
}

/** `git:<user.email>` of the repository, or `undefined` when git has no identity here. */
export function defaultApprover(dir: string): string | undefined {
  const result = spawnSync('git', ['config', 'user.email'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const email = result.status === 0 ? result.stdout.trim() : '';
  return email === '' ? undefined : `git:${email}`;
}

/** Rescans, applies the approvals, writes `ruleprint.lock` and a refreshed `ruleprint.json`. */
export async function approveProject(
  dir: string,
  options: ApproveProjectOptions,
): Promise<ApproveResult> {
  const root = resolve(dir);
  const scan = await scanProject(root, options.scanOptions);
  const approvedAt = (options.now ?? new Date()).toISOString();
  const lock = applyApprovals(scan.lock, scan.document, scan.changes, {
    ...(options.all !== undefined && { all: options.all }),
    ...(options.ids !== undefined && { ids: options.ids }),
    approvedAt,
    ...(options.approvedBy !== undefined && { approvedBy: options.approvedBy }),
  });
  const applied = options.all
    ? scan.changes
    : scan.changes.filter((change) => options.ids?.includes(change.id));

  writeLock(root, lock);
  const refreshed = await scanProject(root, { ...options.scanOptions, lock });
  writeFileSync(
    resolve(options.out ?? join(root, 'ruleprint.json')),
    serializeDocument(refreshed.document),
  );
  return { lock, document: refreshed.document, applied, scan };
}
