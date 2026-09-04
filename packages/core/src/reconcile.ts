import { validate, type Project, type RulePrintDocument } from '@ruleprint/spec';

import { prepareCandidates, toRule, type RuleState } from './candidates.js';
import type { RuleCandidate } from './collector.js';
import { fingerprintCandidate } from './fingerprint.js';
import { assignIds } from './ids.js';
import type { LockFile } from './lock.js';

export type ChangeKind = 'added' | 'changed' | 'renamed' | 'removed';

/** One difference between the current scan and the lock (ADR-0005). */
export interface Change {
  readonly kind: ChangeKind;
  readonly id: string;
  /** Current title; for `removed`, the title remembered by the lock. */
  readonly title: string;
  /** For `renamed`: the title the lock remembers. */
  readonly previousTitle?: string;
}

export interface ReconcileOptions {
  readonly project: Project;
  readonly candidates: readonly RuleCandidate[];
  /** RFC 3339 timestamp; passed in so the core stays free of clocks. */
  readonly generatedAt: string;
  readonly lock: LockFile;
}

export interface ReconcileResult {
  readonly document: RulePrintDocument;
  readonly changes: readonly Change[];
}

const KIND_ORDER: Record<ChangeKind, number> = { added: 0, changed: 1, renamed: 2, removed: 3 };

function keyOf(collector: string, title: string): string {
  return `${collector}\0${title}`;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/**
 * Turns collector output into a `ruleprint.json` document, using the lock to keep ids stable
 * and to decide each rule's status, and lists what changed since the lock was written.
 */
export async function reconcile(options: ReconcileOptions): Promise<ReconcileResult> {
  const candidates = prepareCandidates(options.candidates);
  const fingerprints = await Promise.all(candidates.map((c) => fingerprintCandidate(c)));
  const lockEntries = Object.entries(options.lock.rules);

  const states: (RuleState | undefined)[] = candidates.map(() => undefined);
  const changes: Change[] = [];
  const matchedIds = new Set<string>();

  // 1. Same collector and title: the rule kept its identity.
  const entryByKey = new Map(lockEntries.map(([id, e]) => [keyOf(e.collector, e.title), id]));
  candidates.forEach((candidate, i) => {
    const id = entryByKey.get(keyOf(candidate.origin.collector, candidate.title));
    if (id === undefined || matchedIds.has(id)) return;
    const entry = options.lock.rules[id];
    if (!entry) return;
    matchedIds.add(id);
    const fingerprint = fingerprints[i] ?? '';
    if (entry.fingerprint === fingerprint) {
      states[i] = {
        id,
        fingerprint,
        status: 'approved',
        approvedAt: entry.approvedAt,
        ...(entry.approvedBy !== undefined && { approvedBy: entry.approvedBy }),
      };
    } else {
      states[i] = { id, fingerprint, status: 'drifted' };
      changes.push({ kind: 'changed', id, title: candidate.title });
    }
  });

  // 2. Same body, different title: a rename, only when unambiguous on both sides.
  const freeEntries = lockEntries.filter(([id]) => !matchedIds.has(id));
  const entriesByFingerprint = groupBy(freeEntries, ([, e]) => e.fingerprint);
  const freeCandidates = candidates.map((_, i) => i).filter((i) => states[i] === undefined);
  const candidatesByFingerprint = groupBy(freeCandidates, (i) => fingerprints[i] ?? '');
  for (const [fingerprint, indices] of candidatesByFingerprint) {
    const entries = entriesByFingerprint.get(fingerprint);
    if (!entries || entries.length !== 1 || indices.length !== 1) continue;
    const [i] = indices;
    const [first] = entries;
    if (i === undefined || !first) continue;
    const [id, entry] = first;
    const candidate = candidates[i];
    if (!candidate) continue;
    matchedIds.add(id);
    states[i] = { id, fingerprint, status: 'drifted' };
    changes.push({ kind: 'renamed', id, title: candidate.title, previousTitle: entry.title });
  }

  // 3. Everything else is new: hash-based ids that avoid every id the lock knows.
  const remaining = candidates.map((_, i) => i).filter((i) => states[i] === undefined);
  const reserved = new Set<string>(Object.keys(options.lock.rules));
  for (const state of states) if (state) reserved.add(state.id);
  const newIds = assignIds(
    remaining.map((i) => candidates[i]).filter((c): c is RuleCandidate => c !== undefined),
    reserved,
  );
  remaining.forEach((i, n) => {
    const id = newIds[n] ?? '';
    const candidate = candidates[i];
    if (!candidate) return;
    states[i] = { id, fingerprint: fingerprints[i] ?? '', status: 'pending' };
    changes.push({ kind: 'added', id, title: candidate.title });
  });

  // 4. Locked rules nobody produced any more.
  for (const [id, entry] of lockEntries) {
    if (!matchedIds.has(id)) changes.push({ kind: 'removed', id, title: entry.title });
  }

  const rules = candidates.map((candidate, i) => {
    const state = states[i];
    if (!state) throw new Error(`no state for candidate ${candidate.title}`);
    return toRule(candidate, state);
  });
  const document = {
    specVersion: '0.1' as const,
    project: options.project,
    generatedAt: options.generatedAt,
    rules,
  };
  const result = validate(document);
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ');
    throw new Error(`assembled document is invalid: ${details}`);
  }

  changes.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
  return { document: result.document, changes };
}
