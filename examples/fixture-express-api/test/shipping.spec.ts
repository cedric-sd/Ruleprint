import { describe, expect, it } from 'vitest';

import { calcFreight, FREE_SHIPPING_THRESHOLD } from '../src/shipping.js';

const southeast = { zip: '01310-100' };
const northeast = { zip: '40020-000' };

describe('shipping', () => {
  describe('frete grátis', () => {
    it('acima de 300 reais no Sudeste', () => {
      expect(calcFreight(350, southeast)).toBe(0);
    });

    it(`exatamente ${FREE_SHIPPING_THRESHOLD} reais também é grátis`, () => {
      expect(calcFreight(FREE_SHIPPING_THRESHOLD, southeast)).toBe(0);
    });

    it('não vale fora do Sudeste', () => {
      expect(calcFreight(350, northeast)).toBe(34.9);
    });
  });

  describe('tabela cheia', () => {
    it.each([
      ['Sudeste', southeast, 19.9],
      ['Nordeste', northeast, 34.9],
    ])('abaixo de 300 reais no %s cobra a tabela da região', (_region, address, expected) => {
      expect(calcFreight(100, address)).toBe(expected);
    });
  });
});
