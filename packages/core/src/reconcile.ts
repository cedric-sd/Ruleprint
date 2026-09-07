import { validate, type Project, type RulePrintDocument, type RuleSource } from '@ruleprint/spec';

import {
  groupCandidates,
  isOrphan,
  mergeGroups,
  mergedSources,
  prepareCandidates,
  primaryOf,
  toRule,
  type RuleGroup,
  type RuleState,
} from './candidates.js';
import type { RuleCandidate } from './collector.js';
import { combineFingerprints, fingerprintCandidate } from './fingerprint.js';
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
  /** Things worth telling the user that are not errors, e.g. a `@rule` pointing nowhere. */
  readonly notes: readonly string[];
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

async function fingerprintGroup(group: RuleGroup): Promise<string> {
  return combineFingerprints(await Promise.all(group.members.map((m) => fingerprintCandidate(m))));
}

/** A rule in the making: its group, its id and how the id was found. */
interface Resolved {
  group: RuleGroup;
  id: string;
  /** Title the lock remembers when the id came from a body match (a rename). */
  renamedFrom?: string;
}

/**
 * Turns collector output into a `ruleprint.json` document: keeps ids stable and derives
 * statuses from the lock (ADR-0005), merges declarations into the rule whose id they name with
 * precedence declared > derived > inferred, attaches `@rule` links and flags orphans (ADR-0006),
 * and lists what changed since the lock was written.
 */
export async function reconcile(options: ReconcileOptions): Promise<ReconcileResult> {
  const { groups, links } = groupCandidates(prepareCandidates(options.candidates));
  const lockEntries = Object.entries(options.lock.rules);
  const notes: string[] = [];

  // Phase A: ids for candidates without an explicit id — by title, then body, then hash.
  const implicit = groups.filter((g) => g.explicitId === undefined);
  const implicitFingerprints = await Promise.all(implicit.map((g) => fingerprintGroup(g)));
  const resolved: (Resolved | undefined)[] = implicit.map(() => undefined);
  const matchedIds = new Set<string>();

  const entryByKey = new Map(lockEntries.map(([id, e]) => [keyOf(e.collector, e.title), id]));
  implicit.forEach((group, i) => {
    const primary = primaryOf(group);
    const id = entryByKey.get(keyOf(primary.origin.collector, primary.title));
    if (id === undefined || matchedIds.has(id)) return;
    matchedIds.add(id);
    resolved[i] = { group, id };
  });

  const freeEntries = lockEntries.filter(([id]) => !matchedIds.has(id));
  const entriesByFingerprint = groupBy(freeEntries, ([, e]) => e.fingerprint);
  const freeGroups = implicit.map((_, i) => i).filter((i) => resolved[i] === undefined);
  const groupsByFingerprint = groupBy(freeGroups, (i) => implicitFingerprints[i] ?? '');
  for (const [fingerprint, indices] of groupsByFingerprint) {
    const entries = entriesByFingerprint.get(fingerprint);
    if (!entries || entries.length !== 1 || indices.length !== 1) continue;
    const [i] = indices;
    const [first] = entries;
    if (i === undefined || !first) continue;
    const [id, entry] = first;
    const group = implicit[i];
    if (!group) continue;
    matchedIds.add(id);
    resolved[i] = { group, id, renamedFrom: entry.title };
  }

  const remaining = implicit.map((_, i) => i).filter((i) => resolved[i] === undefined);
  const reserved = new Set<string>(Object.keys(options.lock.rules));
  for (const r of resolved) if (r) reserved.add(r.id);
  const newIds = assignIds(
    remaining
      .map((i) => implicit[i])
      .filter((g): g is RuleGroup => g !== undefined)
      .map(primaryOf),
    reserved,
  );
  remaining.forEach((i, n) => {
    const group = implicit[i];
    if (group) resolved[i] = { group, id: newIds[n] ?? '' };
  });

  // Phase B: declarations join the rule whose id they name, or stand alone with that id.
  const rules = new Map<string, Resolved>();
  for (const r of resolved) {
    if (r) rules.set(r.id, r);
  }
  for (const group of groups) {
    if (group.explicitId === undefined) continue;
    const existing = rules.get(group.explicitId);
    if (existing) {
      existing.group = mergeGroups(existing.group, group);
    } else {
      rules.set(group.explicitId, { group, id: group.explicitId });
    }
  }

  // Phase C: statuses and changes against the lock, on the final groups.
  const final = [...rules.values()];
  const fingerprints = await Promise.all(final.map((r) => fingerprintGroup(r.group)));
  const changes: Change[] = [];
  const states: RuleState[] = final.map((r, i) => {
    const fingerprint = fingerprints[i] ?? '';
    const title = primaryOf(r.group).title;
    const entry = options.lock.rules[r.id];
    if (entry && entry.fingerprint === fingerprint && r.renamedFrom === undefined) {
      return {
        id: r.id,
        fingerprint,
        status: 'approved',
        approvedAt: entry.approvedAt,
        ...(entry.approvedBy !== undefined && { approvedBy: entry.approvedBy }),
      };
    }
    if (entry && entry.fingerprint === fingerprint && r.renamedFrom !== undefined) {
      changes.push({ kind: 'renamed', id: r.id, title, previousTitle: r.renamedFrom });
      return { id: r.id, fingerprint, status: 'drifted' };
    }
    if (entry) {
      changes.push({ kind: 'changed', id: r.id, title });
      return { id: r.id, fingerprint, status: 'drifted' };
    }
    changes.push({ kind: 'added', id: r.id, title });
    return { id: r.id, fingerprint, status: 'pending' };
  });
  const presentIds = new Set(final.map((r) => r.id));
  for (const [id, entry] of lockEntries) {
    if (!presentIds.has(id)) changes.push({ kind: 'removed', id, title: entry.title });
  }

  // Phase D: `@rule` links, orphans, rules.
  const indexById = new Map(final.map((r, i) => [r.id, i]));
  const linkedSources = new Map<number, RuleSource[]>();
  for (const link of links) {
    const target = link.attachTo ?? '';
    const index = indexById.get(target);
    const [source] = link.origin.sources;
    if (index === undefined) {
      const where = source.line !== undefined ? `${source.file}:${source.line}` : source.file;
      notes.push(`unknown @rule ${target} in ${where}`);
      continue;
    }
    const list = linkedSources.get(index) ?? [];
    list.push(...link.origin.sources);
    linkedSources.set(index, list);
  }

  const built = final.map((r, i) => {
    const state = states[i];
    if (!state) throw new Error(`no state for rule ${r.id}`);
    const sources = mergedSources(r.group, linkedSources.get(i) ?? []);
    const status = isOrphan(primaryOf(r.group).origin.confidence, sources)
      ? 'orphan'
      : state.status;
    return toRule(r.group, { ...state, status }, sources);
  });
  built.sort((a, b) => {
    const ka = `${a.origin.collector}\0${a.title}\0${a.origin.sources[0].file}`;
    const kb = `${b.origin.collector}\0${b.title}\0${b.origin.sources[0].file}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const document = {
    specVersion: '0.1' as const,
    project: options.project,
    generatedAt: options.generatedAt,
    rules: built,
  };
  const result = validate(document);
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ');
    throw new Error(`assembled document is invalid: ${details}`);
  }

  changes.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
  return { document: result.document, changes, notes };
}
