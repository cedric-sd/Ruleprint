import type { Confidence, Rule } from '@ruleprint/spec';

export interface RuleFilter {
  readonly query: string;
  readonly tags: readonly string[];
  readonly confidence: readonly Confidence[];
}

export const EMPTY_FILTER: RuleFilter = { query: '', tags: [], confidence: [] };

export const CONFIDENCES: readonly Confidence[] = ['declared', 'derived', 'inferred'];

function haystack(rule: Rule): string {
  return [rule.id, rule.title, rule.description ?? '', ...(rule.tags ?? [])]
    .join('\n')
    .toLowerCase();
}

/** Rules matching every part of the filter; the query is a case-insensitive substring match. */
export function filterRules(rules: readonly Rule[], filter: RuleFilter): Rule[] {
  const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return rules.filter((rule) => {
    if (filter.confidence.length > 0 && !filter.confidence.includes(rule.origin.confidence)) {
      return false;
    }
    if (filter.tags.some((tag) => !(rule.tags ?? []).includes(tag))) {
      return false;
    }
    if (terms.length === 0) return true;
    const text = haystack(rule);
    return terms.every((term) => text.includes(term));
  });
}

export interface TagCount {
  readonly tag: string;
  readonly count: number;
}

/** Every tag in use, most frequent first, then alphabetical. */
export function allTags(rules: readonly Rule[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    for (const tag of rule.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

export function countByConfidence(rules: readonly Rule[]): Record<Confidence, number> {
  const counts: Record<Confidence, number> = { declared: 0, derived: 0, inferred: 0 };
  for (const rule of rules) counts[rule.origin.confidence] += 1;
  return counts;
}
