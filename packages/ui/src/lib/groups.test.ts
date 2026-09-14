import type { Rule } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import { displayTitle, groupRules, UNGROUPED } from './groups.js';

function rule(
  id: string,
  title: string,
  group?: string,
  status: Rule['status'] = 'approved',
): Rule {
  return {
    id,
    title,
    ...(group !== undefined && { group }),
    origin: { collector: 'tests', confidence: 'derived', sources: [{ file: 'a.ts' }] },
    fingerprint: `sha256:${'0'.repeat(64)}`,
    status,
  };
}

const rules = [
  rule('RP-000001', 'shipping > frete grátis > acima de 300', 'shipping'),
  rule('RP-000002', 'Cupom expirado é recusado', undefined, 'orphan'),
  rule('RP-000003', 'order validation > rejects an empty order', 'order validation', 'pending'),
  rule('RP-000004', 'shipping > tabela cheia > abaixo de 300', 'shipping', 'drifted'),
  rule('RP-000005', 'Pedido acima de R$300 tem frete grátis', 'shipping'),
  rule('RP-000006', 'calcFreight: when isSoutheast(address), returns 19.9', 'calcFreight'),
];

describe('groupRules()', () => {
  it('groups by the exact group name, alphabetically, ungrouped last', () => {
    const groups = groupRules(rules);
    expect(groups.map((g) => g.name)).toEqual([
      'calcFreight',
      'order validation',
      'shipping',
      UNGROUPED,
    ]);
    expect(groups.map((g) => g.rules.map((r) => r.id))).toEqual([
      ['RP-000006'],
      ['RP-000003'],
      ['RP-000001', 'RP-000004', 'RP-000005'],
      ['RP-000002'],
    ]);
  });

  it('counts the rules that still need attention in each group', () => {
    const groups = groupRules(rules);
    expect(groups.map((g) => [g.name, g.rules.length, g.pending])).toEqual([
      ['calcFreight', 1, 0],
      ['order validation', 1, 1],
      ['shipping', 3, 1],
      [UNGROUPED, 1, 1],
    ]);
  });

  it('keeps the order of the rules inside a group and returns nothing for no rules', () => {
    expect(groupRules([])).toEqual([]);
    const [shipping] = groupRules(rules.filter((r) => r.group === 'shipping').reverse());
    expect(shipping?.rules.map((r) => r.id)).toEqual(['RP-000005', 'RP-000004', 'RP-000001']);
  });
});

describe('displayTitle()', () => {
  it('drops the group prefix from a test title, and nothing else', () => {
    expect(displayTitle(rules[0] as Rule)).toBe('frete grátis > acima de 300');
    expect(displayTitle(rules[4] as Rule)).toBe('Pedido acima de R$300 tem frete grátis');
    expect(displayTitle(rules[1] as Rule)).toBe('Cupom expirado é recusado');
    expect(displayTitle(rules[5] as Rule)).toBe('when isSoutheast(address), returns 19.9');
    expect(displayTitle(rule('RP-000009', 'shipping', 'shipping'))).toBe('shipping');
    expect(displayTitle(rule('RP-000010', 'shipping > ', 'shipping'))).toBe('shipping > ');
  });
});
