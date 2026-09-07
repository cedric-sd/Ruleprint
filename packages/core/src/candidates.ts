import type { Confidence, Rule, RuleEvidence, RuleSource, RuleStatus } from '@ruleprint/spec';

import type { RuleCandidate } from './collector.js';

const CONFIDENCE_RANK: Record<Confidence, number> = { declared: 0, derived: 1, inferred: 2 };

function identity(candidate: RuleCandidate): string {
  return JSON.stringify([
    candidate.attachTo ?? null,
    candidate.id ?? null,
    candidate.origin.collector,
    candidate.title,
    candidate.origin.sources.map((s) => [s.file, s.line ?? null, s.symbol ?? null, s.kind ?? null]),
  ]);
}

export function sortKey(candidate: RuleCandidate): string {
  const [source] = candidate.origin.sources;
  return [
    candidate.origin.collector,
    candidate.title,
    source.file,
    String(source.line ?? 0).padStart(9, '0'),
  ].join('\0');
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Removes exact duplicates and sorts by collector, title, file and line. */
export function prepareCandidates(candidates: readonly RuleCandidate[]): RuleCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = identity(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => compareKeys(sortKey(a), sortKey(b)));
}

/**
 * Candidates that define one rule together (ADR-0006). `members` is ordered by confidence
 * (declared first) and then deterministically; `members[0]` provides title, description and tags.
 */
export interface RuleGroup {
  readonly explicitId?: string;
  readonly members: readonly [RuleCandidate, ...RuleCandidate[]];
}

export interface GroupedCandidates {
  readonly groups: RuleGroup[];
  /** Candidates with `attachTo`: sources for existing rules. */
  readonly links: RuleCandidate[];
}

function compareMembers(a: RuleCandidate, b: RuleCandidate): number {
  return (
    CONFIDENCE_RANK[a.origin.confidence] - CONFIDENCE_RANK[b.origin.confidence] ||
    compareKeys(sortKey(a), sortKey(b))
  );
}

/** Groups prepared candidates: same explicit id → one group; everything else → its own group. */
export function groupCandidates(candidates: readonly RuleCandidate[]): GroupedCandidates {
  const links: RuleCandidate[] = [];
  const byId = new Map<string, RuleCandidate[]>();
  const single: RuleGroup[] = [];
  for (const candidate of candidates) {
    if (candidate.attachTo !== undefined) {
      links.push(candidate);
    } else if (candidate.id !== undefined) {
      const list = byId.get(candidate.id);
      if (list) list.push(candidate);
      else byId.set(candidate.id, [candidate]);
    } else {
      single.push({ members: [candidate] });
    }
  }
  const explicit: RuleGroup[] = [...byId].map(([explicitId, members]) => {
    const sorted = [...members].sort(compareMembers);
    const [first, ...rest] = sorted;
    if (!first) throw new Error('empty group');
    return { explicitId, members: [first, ...rest] };
  });
  const groups = [...single, ...explicit].sort((a, b) =>
    compareKeys(sortKey(a.members[0]), sortKey(b.members[0])),
  );
  return { groups, links };
}

export function primaryOf(group: RuleGroup): RuleCandidate {
  return group.members[0];
}

/** One group out of two: members re-sorted by confidence, explicit id kept when either has one. */
export function mergeGroups(a: RuleGroup, b: RuleGroup): RuleGroup {
  const [first, ...rest] = [...a.members, ...b.members].sort(compareMembers);
  if (!first) throw new Error('empty group');
  const explicitId = a.explicitId ?? b.explicitId;
  return explicitId === undefined
    ? { members: [first, ...rest] }
    : { explicitId, members: [first, ...rest] };
}

function sourceKey(source: RuleSource): string {
  return JSON.stringify([
    source.file,
    source.line ?? null,
    source.symbol ?? null,
    source.kind ?? null,
  ]);
}

/** Sources of every member, in member order, without repetition. */
export function mergedSources(
  group: RuleGroup,
  extra: readonly RuleSource[] = [],
): [RuleSource, ...RuleSource[]] {
  const seen = new Set<string>();
  const out: RuleSource[] = [];
  for (const source of [...group.members.flatMap((m) => m.origin.sources), ...extra]) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...source });
  }
  const [first, ...rest] = out;
  if (!first) throw new Error('a rule needs at least one source');
  return [first, ...rest];
}

function mergedEvidence(group: RuleGroup): RuleEvidence | undefined {
  const withEvidence = group.members.filter((m) => m.evidence !== undefined);
  if (withEvidence.length === 0) return undefined;
  const tests = [...new Set(withEvidence.flatMap((m) => m.evidence?.tests ?? []))];
  const evidence: RuleEvidence = {};
  if (tests.length > 0) evidence.tests = tests;
  const lastRunStatus = withEvidence.find((m) => m.evidence?.lastRunStatus !== undefined)?.evidence
    ?.lastRunStatus;
  if (lastRunStatus !== undefined) evidence.lastRunStatus = lastRunStatus;
  const coveredLines = withEvidence.find((m) => m.evidence?.coveredLines !== undefined)?.evidence
    ?.coveredLines;
  if (coveredLines !== undefined) evidence.coveredLines = coveredLines;
  return evidence;
}

export interface RuleState {
  readonly id: string;
  readonly fingerprint: string;
  readonly status: RuleStatus;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
}

/** A declared rule whose only sources are its declaration files has no evidence. */
export function isOrphan(confidence: Confidence, sources: readonly RuleSource[]): boolean {
  return confidence === 'declared' && sources.every((source) => source.kind === 'config');
}

export function toRule(
  group: RuleGroup,
  state: RuleState,
  sources: [RuleSource, ...RuleSource[]],
): Rule {
  const primary = primaryOf(group);
  const rule: Rule = {
    id: state.id,
    title: primary.title,
    origin: {
      collector: primary.origin.collector,
      confidence: primary.origin.confidence,
      sources,
    },
    fingerprint: state.fingerprint,
    status: state.status,
  };
  if (primary.description !== undefined) rule.description = primary.description;
  if (primary.tags !== undefined) rule.tags = [...primary.tags];
  const evidence = mergedEvidence(group);
  if (evidence !== undefined) rule.evidence = evidence;
  if (state.approvedAt !== undefined) rule.approvedAt = state.approvedAt;
  if (state.approvedBy !== undefined) rule.approvedBy = state.approvedBy;
  return rule;
}
