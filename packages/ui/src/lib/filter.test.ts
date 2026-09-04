import type { Rule } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import { allTags, countByConfidence, EMPTY_FILTER, filterRules } from './filter.js';

function rule(
  id: string,
  title: string,
  confidence: Rule['origin']['confidence'],
  tags: string[] = [],
  description?: string,
): Rule {
  const base: Rule = {
    id,
    title,
    tags,
    origin: { collector: 'tests', confidence, sources: [{ file: 'a.ts' }] },
    fingerprint: `sha256:${'0'.repeat(64)}`,
    status: 'pending',
  };
  return description === undefined ? base : { ...base, description };
}

const rules = [
  rule('RP-000001', 'Pedido acima de R$300 tem frete grátis', 'derived', ['frete', 'checkout']),
  rule('RP-000002', 'Frete grátis vale apenas para o Sudeste', 'declared', ['frete', 'regiao']),
  rule(
    'RP-000003',
    'Pedido abaixo do mínimo é recusado',
    'inferred',
    ['checkout'],
    'MIN_ORDER_VALUE',
  ),
];

describe('filterRules()', () => {
  it('returns everything for the empty filter', () => {
    expect(filterRules(rules, EMPTY_FILTER)).toEqual(rules);
  });

  it('matches every query term against id, title, description and tags, ignoring case', () => {
    expect(filterRules(rules, { ...EMPTY_FILTER, query: 'FRETE grátis' }).map((r) => r.id)).toEqual(
      ['RP-000001', 'RP-000002'],
    );
    expect(filterRules(rules, { ...EMPTY_FILTER, query: 'min_order' }).map((r) => r.id)).toEqual([
      'RP-000003',
    ]);
    expect(filterRules(rules, { ...EMPTY_FILTER, query: 'rp-000002' }).map((r) => r.id)).toEqual([
      'RP-000002',
    ]);
    expect(filterRules(rules, { ...EMPTY_FILTER, query: 'regiao' }).map((r) => r.id)).toEqual([
      'RP-000002',
    ]);
  });

  it('requires every selected tag', () => {
    expect(
      filterRules(rules, { ...EMPTY_FILTER, tags: ['frete', 'checkout'] }).map((r) => r.id),
    ).toEqual(['RP-000001']);
  });

  it('filters by confidence', () => {
    expect(
      filterRules(rules, { ...EMPTY_FILTER, confidence: ['declared', 'inferred'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['RP-000002', 'RP-000003']);
  });
});

describe('allTags()', () => {
  it('counts tags, most frequent first', () => {
    expect(allTags(rules)).toEqual([
      { tag: 'checkout', count: 2 },
      { tag: 'frete', count: 2 },
      { tag: 'regiao', count: 1 },
    ]);
  });
});

describe('countByConfidence()', () => {
  it('counts every level, including empty ones', () => {
    expect(countByConfidence(rules)).toEqual({ declared: 1, derived: 1, inferred: 1 });
    expect(countByConfidence([])).toEqual({ declared: 0, derived: 0, inferred: 0 });
  });
});
