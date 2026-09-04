export const PACKAGE_NAME = '@ruleprint/core' as const;

export type { CollectContext, Collector, RuleCandidate, SourceFile } from './collector.js';
export { applyApprovals, type ApproveOptions } from './approve.js';
export { exitCodeFor, summarizeChanges, type ChangeSummary } from './check.js';
export { assembleDocument, type AssembledDocument, type AssembleOptions } from './document.js';
export {
  emptyLock,
  LOCK_FILE_NAME,
  LOCK_VERSION,
  parseLock,
  serializeLock,
  type LockEntry,
  type LockFile,
} from './lock.js';
export {
  reconcile,
  type Change,
  type ChangeKind,
  type ReconcileOptions,
  type ReconcileResult,
} from './reconcile.js';
export { fingerprintCandidate } from './fingerprint.js';
export { assignIds, fnv1a32, idForKey } from './ids.js';
export { collectFromFiles } from './pipeline.js';
