import type { RulePrintDocument } from '@ruleprint/spec';

import { LOCK_VERSION, type LockEntry, type LockFile } from './lock.js';
import type { Change } from './reconcile.js';

export interface ApproveOptions {
  /** Approve every change. */
  readonly all?: boolean;
  /** Approve only these ids; each must be a current change. */
  readonly ids?: readonly string[];
  /** RFC 3339 timestamp written to every approval. */
  readonly approvedAt: string;
  readonly approvedBy?: string;
}

/**
 * Applies approvals to the lock: `added`, `changed` and `renamed` upsert the rule with its
 * current title and fingerprint; `removed` deletes it. Returns the new lock.
 */
export function applyApprovals(
  lock: LockFile,
  document: RulePrintDocument,
  changes: readonly Change[],
  options: ApproveOptions,
): LockFile {
  let selected: readonly Change[];
  if (options.all) {
    selected = changes;
  } else {
    selected = (options.ids ?? []).map((id) => {
      const change = changes.find((c) => c.id === id);
      if (!change) throw new Error(`${id} is not a pending change`);
      return change;
    });
  }

  const rules: Record<string, LockEntry> = { ...lock.rules };
  for (const change of selected) {
    if (change.kind === 'removed') {
      delete rules[change.id];
      continue;
    }
    const rule = document.rules.find((r) => r.id === change.id);
    if (!rule) throw new Error(`${change.id} is not in the document`);
    rules[change.id] = {
      title: rule.title,
      collector: rule.origin.collector,
      fingerprint: rule.fingerprint,
      approvedAt: options.approvedAt,
      ...(options.approvedBy !== undefined && { approvedBy: options.approvedBy }),
    };
  }
  return { lockVersion: LOCK_VERSION, rules };
}
