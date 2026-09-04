import type { Project, RulePrintDocument } from '@ruleprint/spec';

import type { RuleCandidate } from './collector.js';
import { emptyLock, type LockFile } from './lock.js';
import { reconcile, type Change } from './reconcile.js';

export interface AssembleOptions {
  readonly project: Project;
  readonly candidates: readonly RuleCandidate[];
  /** RFC 3339 timestamp; passed in so the core stays free of clocks. */
  readonly generatedAt: string;
  /** Approved rules; without it every rule is `pending`. */
  readonly lock?: LockFile;
}

export interface AssembledDocument {
  readonly document: RulePrintDocument;
  readonly changes: readonly Change[];
}

/**
 * Turns collector output into a valid `ruleprint.json` document: sorts, removes exact
 * duplicates, assigns ids and fingerprints, derives each rule's status from the lock and
 * validates the result. See {@link reconcile} for the rules.
 */
export function assembleDocument(options: AssembleOptions): Promise<AssembledDocument> {
  return reconcile({ ...options, lock: options.lock ?? emptyLock() });
}
