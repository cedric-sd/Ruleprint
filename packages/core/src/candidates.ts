import type { Rule, RuleStatus } from '@ruleprint/spec';

import type { RuleCandidate } from './collector.js';

function identity(candidate: RuleCandidate): string {
  return JSON.stringify([
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
    .sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

export interface RuleState {
  readonly id: string;
  readonly fingerprint: string;
  readonly status: RuleStatus;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
}

export function toRule(candidate: RuleCandidate, state: RuleState): Rule {
  const rule: Rule = {
    id: state.id,
    title: candidate.title,
    origin: {
      collector: candidate.origin.collector,
      confidence: candidate.origin.confidence,
      sources: [...candidate.origin.sources],
    },
    fingerprint: state.fingerprint,
    status: state.status,
  };
  if (candidate.description !== undefined) rule.description = candidate.description;
  if (candidate.tags !== undefined) rule.tags = [...candidate.tags];
  if (candidate.evidence !== undefined) rule.evidence = candidate.evidence;
  if (state.approvedAt !== undefined) rule.approvedAt = state.approvedAt;
  if (state.approvedBy !== undefined) rule.approvedBy = state.approvedBy;
  return rule;
}
