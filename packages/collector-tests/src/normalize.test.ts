import { describe, expect, it } from 'vitest';

import { extractTestCases } from './extract.js';
import { getParser } from './parser.js';

async function normalizedOf(source: string, index = 0): Promise<string> {
  const parser = await getParser('typescript');
  const tree = parser.parse(source);
  if (!tree) throw new Error('parse failed');
  const cases = extractTestCases(tree.rootNode);
  const testCase = cases[index];
  if (!testCase) throw new Error(`no test case at index ${index}`);
  return testCase.normalized;
}

const base = `
describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    const address = { zip: '01310-100' };
    expect(calcFreight(350, address)).toBe(0);
  });
});
`;

describe('normalised test bodies', () => {
  it('is deterministic and does not contain the title', async () => {
    const a = await normalizedOf(base);
    const b = await normalizedOf(base);
    expect(a).toBe(b);
    expect(a).not.toContain('acima de 300');
    expect(a).toContain('<title>');
  });

  it.each([
    [
      'quotes, semicolons and indentation',
      `describe("shipping", () => {
        it("acima de 300 reais no Sudeste", () => {
              const address = { zip: "01310-100" }
              expect(calcFreight(350, address)).toBe(0)
        })
      })`,
    ],
    [
      'comments and blank lines',
      `describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    // build the address

    const address = { zip: '01310-100' }; /* inline */

    expect(calcFreight(350, address)).toBe(0);
  });
});`,
    ],
    [
      'trailing commas and line breaks inside calls',
      `describe('shipping', () => {
  it(
    'acima de 300 reais no Sudeste',
    () => {
      const address = {
        zip: '01310-100',
      };
      expect(
        calcFreight(
          350,
          address,
        ),
      ).toBe(0);
    },
  );
});`,
    ],
    [
      'a renamed local variable',
      `describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    const southeastAddress = { zip: '01310-100' };
    expect(calcFreight(350, southeastAddress)).toBe(0);
  });
});`,
    ],
    [
      'a different title',
      `describe('shipping', () => {
  it('free shipping above 300 in the southeast', () => {
    const address = { zip: '01310-100' };
    expect(calcFreight(350, address)).toBe(0);
  });
});`,
    ],
  ])('is unchanged by %s', async (_label, variant) => {
    expect(await normalizedOf(variant)).toBe(await normalizedOf(base));
  });

  it.each([
    [
      'a changed literal',
      `describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    const address = { zip: '01310-100' };
    expect(calcFreight(250, address)).toBe(0);
  });
});`,
    ],
    [
      'a changed assertion',
      `describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    const address = { zip: '01310-100' };
    expect(calcFreight(350, address)).not.toBe(0);
  });
});`,
    ],
    [
      'a different free identifier',
      `describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    const address = { zip: '01310-100' };
    expect(calcPrice(350, address)).toBe(0);
  });
});`,
    ],
    [
      'a different matcher',
      `describe('shipping', () => {
  it('acima de 300 reais no Sudeste', () => {
    const address = { zip: '01310-100' };
    expect(calcFreight(350, address)).toEqual(0);
  });
});`,
    ],
    [
      'a skip modifier',
      `describe('shipping', () => {
  it.skip('acima de 300 reais no Sudeste', () => {
    const address = { zip: '01310-100' };
    expect(calcFreight(350, address)).toBe(0);
  });
});`,
    ],
  ])('changes with %s', async (_label, variant) => {
    expect(await normalizedOf(variant)).not.toBe(await normalizedOf(base));
  });

  it('treats `a => x` and `(a) => x` alike and alpha-renames parameters', async () => {
    const short = `it('t', () => { const f = a => a + 1; expect(f(1)).toBe(2); });`;
    const long = `it('t', () => { const g = (value) => value + 1; expect(g(1)).toBe(2); });`;
    expect(await normalizedOf(short)).toBe(await normalizedOf(long));
  });

  it('renames destructured, rest, catch and loop bindings', async () => {
    const a = `it('t', ({ a, b: [c, ...d] }) => { for (const e of d) { try { use(e); } catch (err) { log(err); } } });`;
    const b = `it('t', ({ a: x, b: [y, ...z] }) => { for (const item of z) { try { use(item); } catch (e) { log(e); } } });`;
    expect(await normalizedOf(a)).toBe(await normalizedOf(b));
  });

  it('does not confuse a renamed local with a different free identifier', async () => {
    const local = `it('t', () => { const limit = 300; expect(limit).toBe(300); });`;
    const free = `it('t', () => { const limit = 300; expect(LIMIT).toBe(300); });`;
    expect(await normalizedOf(local)).not.toBe(await normalizedOf(free));
  });

  it('includes the each table', async () => {
    const one = `it.each([[1], [2]])('case %s', (n) => { expect(n).toBeGreaterThan(0); });`;
    const two = `it.each([[1], [3]])('case %s', (n) => { expect(n).toBeGreaterThan(0); });`;
    expect(await normalizedOf(one)).not.toBe(await normalizedOf(two));
  });
});
