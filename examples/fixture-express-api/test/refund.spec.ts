import { describe, expect, it } from 'vitest';

import { canRefund } from '../src/refund.js';

const day = 24 * 60 * 60 * 1000;
const charge = (daysAgo: number, disputed = false) => ({
  chargedAt: new Date(Date.now() - daysAgo * day),
  amount: 100,
  disputed,
});

describe('refund', () => {
  describe('janela de 7 dias', () => {
    it('permite reembolso dentro da janela', () => {
      expect(canRefund(charge(3), new Date())).toBe(true);
    });

    it('bloqueia reembolso após a janela', () => {
      expect(canRefund(charge(8), new Date())).toBe(false);
    });
  });

  describe.each([['disputada'], ['em análise']])('cobrança %s', () => {
    it('nunca é reembolsável', () => {
      expect(canRefund(charge(1, true), new Date())).toBe(false);
    });
  });

  it.only('ignora cobranças com valor zero', () => {
    expect(canRefund({ ...charge(1), amount: 0 }, new Date())).toBe(true);
  });

  it('', () => {
    // empty title: nothing to derive
  });
});
