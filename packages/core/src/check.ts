import type { Change, ChangeKind } from './reconcile.js';

export type ChangeSummary = Record<ChangeKind, number>;

export function summarizeChanges(changes: readonly Change[]): ChangeSummary {
  const summary: ChangeSummary = { added: 0, changed: 0, renamed: 0, removed: 0 };
  for (const change of changes) summary[change.kind] += 1;
  return summary;
}

/** `ruleprint check`: 0 when the scan matches the lock, 1 when anything needs approval. */
export function exitCodeFor(changes: readonly Change[]): 0 | 1 {
  return changes.length === 0 ? 0 : 1;
}
