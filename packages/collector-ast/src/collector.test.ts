import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RuleCandidate } from '@ruleprint/core';
import type { AstConfig } from '@ruleprint/spec';
import { describe, expect, it, vi } from 'vitest';

import { createAstCollector } from './index.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const FIXTURE_CONFIG = JSON.parse(
  readFileSync(join(FIXTURE, '.ruleprint/config.json'), 'utf8'),
) as {
  ast: { include: string[]; glossary: string[] };
};

const ctx = { warn: vi.fn<(message: string) => void>() };

async function collect(
  source: string,
  options: { glossary?: string[] } = {},
  path = 'src/domain/a.ts',
) {
  const collector = createAstCollector({ include: ['src/**'], ...options });
  return collector.collect({ path, content: source }, ctx);
}

const titles = (candidates: RuleCandidate[]) => candidates.map((c) => c.title);

describe('createAstCollector()', () => {
  it('is named "ast"', () => {
    expect(createAstCollector({ include: ['src/**'] }).name).toBe('ast');
  });

  describe('match()', () => {
    const collector = createAstCollector({
      include: ['src/**', 'lib/domain/*.ts'],
      exclude: ['src/legacy/**'],
    });
    it.each(['src/a.ts', 'src/deep/er/b.js', 'src/c.tsx', 'lib/domain/d.ts'])(
      'matches %s',
      (path) => {
        expect(collector.match(path)).toBe(true);
      },
    );
    it.each([
      'lib/other.ts',
      'lib/domain/sub/e.ts',
      'src/legacy/f.ts',
      'src/a.test.ts',
      'src/a.spec.ts',
      'src/__tests__/g.ts',
      'src/data.json',
      'src/README.md',
    ])('does not match %s', (path) => {
      expect(collector.match(path)).toBe(false);
    });
  });

  describe('against examples/fixture-express-api', () => {
    const collector = createAstCollector(FIXTURE_CONFIG.ast);
    const files = ['src/app.ts', 'src/order.ts', 'src/refund.ts', 'src/shipping.ts'];

    it('matches the snapshot', async () => {
      const all: Record<string, RuleCandidate[]> = {};
      for (const path of files) {
        all[path] = await collector.collect(
          { path, content: readFileSync(join(FIXTURE, path), 'utf8') },
          ctx,
        );
      }
      expect(all).toMatchSnapshot();
    });

    it('turns the domain conditionals into readable inferred rules and nothing else', async () => {
      const all: RuleCandidate[] = [];
      for (const path of files) {
        all.push(
          ...(await collector.collect(
            { path, content: readFileSync(join(FIXTURE, path), 'utf8') },
            ctx,
          )),
        );
      }
      expect(titles(all)).toEqual([
        'assertValidOrder: when count > MAX_ITEMS_PER_ORDER, throws OrderError: too many items',
        'assertValidOrder: when subtotal(items) < MIN_ORDER_VALUE, throws OrderError: below minimum',
        'canRefund: when charge.disputed, returns false',
        'calcFreight: when subtotal >= FREE_SHIPPING_THRESHOLD and isSoutheast(address), returns 0',
        'calcFreight: when isSoutheast(address), returns 19.9 (otherwise 34.9)',
      ]);
      const freight = all[3];
      expect(freight).toMatchObject({
        tags: ['freight', 'southeast'],
        origin: {
          collector: 'ast',
          confidence: 'inferred',
          sources: [{ file: 'src/shipping.ts', line: 14, symbol: 'calcFreight', kind: 'code' }],
        },
      });
      expect(freight?.description).toContain(
        'if (subtotal >= FREE_SHIPPING_THRESHOLD && isSoutheast(address))',
      );
      expect(freight?.normalized).toContain('identifier:FREE_SHIPPING_THRESHOLD');
      expect(all.every((c) => typeof c.normalized === 'string' && c.normalized.length > 0)).toBe(
        true,
      );
    });
  });

  describe('domain signals', () => {
    it.each([
      [
        'a non-trivial number',
        'function f(age) { if (age >= 18) { return true; } }',
        'f: when age >= 18, returns true',
      ],
      [
        'a non-trivial string',
        "function f(s) { if (s === 'paid') { ship(); } }",
        'f: when s is paid, calls ship',
      ],
      [
        'a screaming constant',
        'function f(n) { if (n > LIMIT) { reject(); } }',
        'f: when n > LIMIT, calls reject',
      ],
      [
        'a namespaced constant',
        'function f(n) { if (n > Limits.DAILY) { reject(); } }',
        'f: when n > Limits.DAILY, calls reject',
      ],
      [
        'an enum member',
        'function f(s) { if (s === Status.Active) { go(); } }',
        'f: when s is Status.Active, calls go',
      ],
      [
        'a screaming enum member',
        'function f(s) { if (s !== OrderStatus.PAID) { hold(); } }',
        'f: when s is not OrderStatus.PAID, calls hold',
      ],
    ])('keeps a condition with %s', async (_label, source, title) => {
      expect(titles(await collect(source))).toEqual([title]);
    });

    it('keeps a condition whose identifier contains a glossary term, and tags it', async () => {
      const source = 'function f(x) { if (isCoupon(x)) { apply(x); } }';
      expect(titles(await collect(source))).toEqual([]);
      const [rule] = await collect(source, { glossary: ['coupon'] });
      expect(rule?.title).toBe('f: when isCoupon(x), calls apply');
      expect(rule?.tags).toEqual(['coupon']);
    });

    it('matches glossary terms in property names and snake_case, case-insensitively', async () => {
      const source = 'function f(c) { if (c.refund_window_days > 7) { return; } }';
      const [rule] = await collect(source, { glossary: ['Refund'] });
      expect(rule?.tags).toEqual(['refund']);
    });

    it.each([
      ['a trivial number', 'function f(n) { if (n > 0) { go(); } }'],
      ['an empty string', "function f(s) { if (s === '') { go(); } }"],
      ['only plain identifiers', 'function f(a, b) { if (a && b) { go(); } }'],
      ['a null check', 'function f(a) { if (a == null) { return; } }'],
      ['an undefined check', 'function f(a) { if (a === undefined) { return; } }'],
      ['a negated identifier', 'function f(user) { if (!user) { return; } }'],
      ['optional chaining alone', 'function f(x) { if (x?.y) { go(); } }'],
      ['typeof', "function f(x) { if (typeof x === 'string') { go(); } }"],
      ['instanceof', 'function f(x) { if (x instanceof Error) { go(); } }'],
      ['Array.isArray', 'function f(x) { if (Array.isArray(x)) { go(); } }'],
      ['an emptiness guard', 'function f(items) { if (items.length === 0) { return; } }'],
      ['a length compared to a literal', 'function f(items) { if (items.length > 5) { return; } }'],
      [
        'an environment check',
        "function f() { if (process.env.NODE_ENV === 'production') { return; } }",
      ],
      [
        'a constant mixed with a null check only',
        'function f(a) { if (a === null || a === undefined) { return DEFAULT; } }',
      ],
    ])('drops %s', async (_label, source) => {
      expect(titles(await collect(source))).toEqual([]);
    });

    it('keeps a mixed condition when a real signal is present', async () => {
      const source = 'function f(user) { if (!user || user.age < MIN_AGE) { reject(); } }';
      expect(titles(await collect(source))).toEqual([
        'f: when not user or user.age < MIN_AGE, calls reject',
      ]);
    });
  });

  describe('shapes and consequences', () => {
    it('handles else-if chains, ternaries and switch cases', async () => {
      const source = `
function price(order) {
  if (order.total > BULK_MIN) { return 0.9; }
  else if (order.total > PROMO_MIN) { return 0.95; }
  else { return 1; }
}
function fee(charge) { return charge.amount > MAX_FREE ? 5 : 0; }
function label(status) {
  switch (status) {
    case OrderStatus.PAID:
      total = 0;
      break;
    case 'refunded':
      notify(status);
      break;
    default:
      return 'unknown';
  }
}`;
      expect(titles(await collect(source))).toEqual([
        'price: when order.total > BULK_MIN, returns 0.9',
        'price: when order.total > PROMO_MIN, returns 0.95',
        'fee: when charge.amount > MAX_FREE, returns 5 (otherwise 0)',
        'label: when status is OrderStatus.PAID, sets total',
        'label: when status is refunded, calls notify',
      ]);
    });

    it('describes throws, calls, assignments and other statements', async () => {
      const source = `
function f(n) {
  if (n > MAX) { throw new LimitError('too many'); }
  if (n > MIN) { throw error; }
  if (n > MID) { counter += 1; }
  if (n > LOW) { for (const x of xs) { use(x); } }
}`;
      expect(titles(await collect(source))).toEqual([
        'f: when n > MAX, throws LimitError: too many',
        'f: when n > MIN, throws error',
        'f: when n > MID, sets counter',
        'f: when n > LOW, then for (const x of xs) { use(x); }',
      ]);
    });

    it('uses the enclosing named function, method or const as the symbol', async () => {
      const source = `
class Svc {
  apply(n) { if (n > MAX) { go(); } }
}
const check = (n) => { if (n > MAX) { go(); } };
const other = function (n) { if (n > MAX) { go(); } };
function outer(list) { list.forEach((n) => { if (n > MAX) { go(); } }); }
if (top > MAX) { go(); }
`;
      const rules = await collect(source);
      expect(rules.map((r) => r.origin.sources[0].symbol)).toEqual([
        'apply',
        'check',
        'other',
        'outer',
      ]);
      expect(titles(rules)[0]).toBe('apply: when n > MAX, calls go');
    });

    it('skips conditions inside catch blocks and loop headers', async () => {
      const source = `
function f(xs) {
  try { run(); } catch (e) { if (e.code === 'E_LIMIT') { retry(); } }
  for (let i = 0; i < MAX; i += 1) { step(i); }
  while (n > MAX) { n -= 1; }
}`;
      expect(titles(await collect(source))).toEqual([]);
    });

    it('reports a syntax error once and keeps what it can', async () => {
      const warn = vi.fn<(message: string) => void>();
      const collector = createAstCollector({ include: ['src/**'] });
      const rules = await collector.collect(
        { path: 'src/x.ts', content: 'function f(n) { if (n > MAX) { go(); } }\nfunction g( {' },
        { warn },
      );
      expect(titles(rules)).toEqual(['f: when n > MAX, calls go']);
      expect(warn.mock.calls).toHaveLength(1);
    });

    it('normalises formatting away but not literals', async () => {
      const a = await collect('function f(n) { if (n > 300) { return true; } }');
      const b = await collect('function f(n) {\n  if (n   >  300) {\n    return true\n  }\n}');
      const c = await collect('function f(n) { if (n > 301) { return true; } }');
      expect(a[0]?.normalized).toBe(b[0]?.normalized);
      expect(c[0]?.normalized).not.toBe(a[0]?.normalized);
    });
  });
});
