import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { CollectContext, RuleCandidate, SourceFile } from '@ruleprint/core';
import { describe, expect, it, vi } from 'vitest';

import { testsCollector } from './index.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE_DIR = join(REPO_ROOT, 'examples/fixture-express-api');

function fixtureFile(name: string): SourceFile {
  const abs = join(FIXTURE_DIR, 'test', name);
  return {
    path: relative(REPO_ROOT, abs).split('\\').join('/'),
    content: readFileSync(abs, 'utf8'),
  };
}

function inline(path: string, content: string): SourceFile {
  return { path, content };
}

function makeContext() {
  return { warn: vi.fn<(message: string) => void>() };
}

async function collect(
  file: SourceFile,
  ctx: CollectContext = makeContext(),
): Promise<RuleCandidate[]> {
  return testsCollector.collect(file, ctx);
}

describe('testsCollector', () => {
  it('is named "tests"', () => {
    expect(testsCollector.name).toBe('tests');
  });

  describe('match()', () => {
    it.each([
      'test/shipping.spec.ts',
      'src/order.test.ts',
      'src/App.test.tsx',
      'lib/util.spec.js',
      'lib/util.test.mjs',
      'src/__tests__/order.ts',
    ])('matches %s', (path) => {
      expect(testsCollector.match(path)).toBe(true);
    });

    it.each([
      'src/shipping.ts',
      'src/order.tsx',
      'README.md',
      'test/fixtures/data.json',
      'src/types.d.ts',
    ])('does not match %s', (path) => {
      expect(testsCollector.match(path)).toBe(false);
    });
  });

  describe('against examples/fixture-express-api', () => {
    const files = readdirSync(join(FIXTURE_DIR, 'test'))
      .filter((name) => testsCollector.match(name))
      .sort();

    it('sees the four fixture test files', () => {
      expect(files).toEqual([
        'broken.spec.ts',
        'order.spec.ts',
        'refund.spec.ts',
        'shipping.spec.ts',
      ]);
    });

    it('matches the snapshot', async () => {
      const all: Record<string, RuleCandidate[]> = {};
      for (const name of files) {
        all[name] = await collect(fixtureFile(name));
      }
      expect(all).toMatchSnapshot();
    });

    it('turns each it() into a derived rule titled with its describe chain', async () => {
      const candidates = await collect(fixtureFile('shipping.spec.ts'));
      expect(candidates.map((c) => c.title)).toEqual([
        'shipping > frete grátis > acima de 300 reais no Sudeste',
        'shipping > frete grátis > exatamente ${FREE_SHIPPING_THRESHOLD} reais também é grátis',
        'shipping > frete grátis > não vale fora do Sudeste',
        'shipping > tabela cheia > abaixo de 300 reais no %s cobra a tabela da região',
      ]);
      for (const candidate of candidates) {
        expect(candidate.origin).toMatchObject({ collector: 'tests', confidence: 'derived' });
        expect(candidate.origin.sources).toHaveLength(1);
        expect(candidate.origin.sources[0]).toMatchObject({
          file: 'examples/fixture-express-api/test/shipping.spec.ts',
          kind: 'test',
        });
      }
    });

    it('points the source at the line of the it() call and names the leaf as symbol', async () => {
      const [first] = await collect(fixtureFile('shipping.spec.ts'));
      expect(first?.origin.sources[0]).toEqual({
        file: 'examples/fixture-express-api/test/shipping.spec.ts',
        line: 10,
        symbol: 'acima de 300 reais no Sudeste',
        kind: 'test',
      });
      expect(first?.evidence).toEqual({
        tests: ['shipping > frete grátis > acima de 300 reais no Sudeste'],
      });
    });

    it('keeps test() and .skip, drops .todo and empty titles', async () => {
      const order = await collect(fixtureFile('order.spec.ts'));
      expect(order.map((c) => c.title)).toEqual([
        'order validation > rejects an empty order',
        'order validation > rejects an order below the minimum value',
        'order validation > rejects more than ${MAX_ITEMS_PER_ORDER} items in one order',
        'order validation > rejects duplicated skus',
        'order validation > accepts a valid order',
      ]);

      const refund = await collect(fixtureFile('refund.spec.ts'));
      expect(refund.map((c) => c.title)).toEqual([
        'refund > janela de 7 dias > permite reembolso dentro da janela',
        'refund > janela de 7 dias > bloqueia reembolso após a janela',
        'refund > cobrança %s > nunca é reembolsável',
        'refund > ignora cobranças com valor zero',
      ]);
    });

    it('collects what it can from a file with a syntax error and warns once', async () => {
      const ctx = makeContext();
      const candidates = await collect(fixtureFile('broken.spec.ts'), ctx);
      // tree-sitter recovers the leaves but may lose the enclosing describe, so only the leaf
      // title is guaranteed.
      const titles = candidates.map((c) => c.title);
      expect(titles.some((t) => t.endsWith('still yields the rule before the syntax error'))).toBe(
        true,
      );
      expect(ctx.warn.mock.calls).toHaveLength(1);
      expect(ctx.warn.mock.calls[0]?.[0]).toContain('broken.spec.ts');
    });
  });

  describe('edge cases', () => {
    it('returns nothing for a file without tests', async () => {
      expect(await collect(inline('src/a.test.ts', 'export const a = 1;\n'))).toEqual([]);
    });

    it('accepts top-level it() without describe', async () => {
      const [only] = await collect(inline('a.test.ts', "it('works alone', () => {});\n"));
      expect(only?.title).toBe('works alone');
    });

    it('unescapes quotes in titles', async () => {
      const found = await collect(
        inline('a.test.ts', 'it(\'it\\\'s fine\', () => {});\nit("says \\"hi\\"", () => {});\n'),
      );
      expect(found.map((c) => c.title)).toEqual(["it's fine", 'says "hi"']);
    });

    it('follows deep nesting and function-expression callbacks', async () => {
      const src = [
        "describe('a', function () {",
        "  describe('b', () => {",
        "    describe('c', () => {",
        "      test('d', function () {});",
        '    });',
        '  });',
        '});',
      ].join('\n');
      const [deep] = await collect(inline('a.test.ts', src));
      expect(deep?.title).toBe('a > b > c > d');
      expect(deep?.origin.sources[0]?.line).toBe(4);
    });

    it('parses tsx files with JSX in test bodies', async () => {
      const src =
        "describe('Button', () => {\n  it('renders', () => {\n    render(<Button label=\"ok\" />);\n  });\n});\n";
      const [rendered] = await collect(inline('src/Button.test.tsx', src));
      expect(rendered?.title).toBe('Button > renders');
    });

    it('parses plain javascript', async () => {
      const src = "const { it } = require('vitest');\nit('works in js', () => {});\n";
      const [js] = await collect(inline('lib/a.test.js', src));
      expect(js?.title).toBe('works in js');
    });

    it('ignores describe/it used as methods of other objects', async () => {
      const src =
        "logger.it('not a test');\nsuite.describe('nope', () => {});\nit('real', () => {});\n";
      const found = await collect(inline('a.test.ts', src));
      expect(found.map((c) => c.title)).toEqual(['real']);
    });

    it('ignores calls whose title is not a literal', async () => {
      const src = 'it(titleFromVariable, () => {});\nit(`tpl ${x}`, () => {});\n';
      const found = await collect(inline('a.test.ts', src));
      expect(found.map((c) => c.title)).toEqual(['tpl ${x}']);
    });
  });
});
