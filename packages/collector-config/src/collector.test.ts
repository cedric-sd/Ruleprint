import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { RuleCandidate, SourceFile } from '@ruleprint/core';
import { describe, expect, it, vi } from 'vitest';

import { configCollector } from './index.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const RULES_DIR = join(FIXTURE, '.ruleprint/rules');

function fixtureFile(name: string): SourceFile {
  const abs = join(RULES_DIR, name);
  return { path: relative(FIXTURE, abs).split('\\').join('/'), content: readFileSync(abs, 'utf8') };
}

function makeContext() {
  return { warn: vi.fn<(message: string) => void>() };
}

async function collect(content: string, path = '.ruleprint/rules/x.md', ctx = makeContext()) {
  return configCollector.collect({ path, content }, ctx);
}

describe('configCollector', () => {
  it('is named "config"', () => {
    expect(configCollector.name).toBe('config');
  });

  describe('match()', () => {
    it.each([
      '.ruleprint/rules/frete.md',
      '.ruleprint/rules/checkout/cupom.md',
      'packages/api/.ruleprint/rules/a.md',
    ])('matches %s', (path) => {
      expect(configCollector.match(path)).toBe(true);
    });
    it.each(['README.md', 'docs/SPEC.md', '.ruleprint/config.md', '.ruleprint/rules/notes.txt'])(
      'does not match %s',
      (path) => {
        expect(configCollector.match(path)).toBe(false);
      },
    );
  });

  describe('against examples/fixture-express-api', () => {
    const files = readdirSync(RULES_DIR).sort();

    it('sees both declared rules', () => {
      expect(files).toEqual(['cupom-expirado.md', 'frete-sudeste.md']);
    });

    it('matches the snapshot', async () => {
      const all: Record<string, RuleCandidate[]> = {};
      for (const name of files)
        all[name] = await collect(fixtureFile(name).content, fixtureFile(name).path);
      expect(all).toMatchSnapshot();
    });

    it('links frete-sudeste to the shipping rule by id and takes title, tags and description', async () => {
      const [rule] = await collect(
        fixtureFile('frete-sudeste.md').content,
        fixtureFile('frete-sudeste.md').path,
      );
      expect(rule).toMatchObject({
        id: 'RP-088272',
        title: 'Pedido acima de R$300 tem frete grátis no Sudeste',
        tags: ['frete', 'checkout'],
        origin: {
          collector: 'config',
          confidence: 'declared',
          sources: [{ file: '.ruleprint/rules/frete-sudeste.md', line: 1, kind: 'config' }],
        },
      });
      expect(rule?.description).toContain('Aplicado apenas para CEPs da região Sudeste.');
      expect(rule?.id).toBeDefined();
    });

    it('takes the title from the H1 and the tags from a block list when there is no id', async () => {
      const [rule] = await collect(
        fixtureFile('cupom-expirado.md').content,
        fixtureFile('cupom-expirado.md').path,
      );
      expect(rule?.id).toBeUndefined();
      expect(rule?.title).toBe('Cupom expirado é recusado no checkout');
      expect(rule?.tags).toEqual(['cupom', 'checkout']);
      expect(rule?.description?.startsWith('Regra declarada pelo time de produto')).toBe(true);
      expect(rule?.description).not.toContain('# Cupom');
    });
  });

  describe('front-matter and body', () => {
    it('accepts quoted values and an empty body', async () => {
      const [rule] = await collect(`---\ntitle: "Título: com dois-pontos"\nid: 'RP-000042'\n---\n`);
      expect(rule).toMatchObject({ id: 'RP-000042', title: 'Título: com dois-pontos' });
      expect(rule?.description).toBeUndefined();
      expect(rule?.tags).toBeUndefined();
    });

    it('falls back to the file name when there is no title anywhere', async () => {
      const [rule] = await collect(
        'Só um corpo, sem front-matter nem título.\n',
        '.ruleprint/rules/limite-diario.md',
      );
      expect(rule?.title).toBe('limite diario');
      expect(rule?.description).toBe('Só um corpo, sem front-matter nem título.');
    });

    it('normalises whitespace but not wording', async () => {
      const a = await collect(
        '---\ntitle: T\ntags: [b, a]\n---\n\nUm  texto\nquebrado   em linhas.\n',
      );
      const b = await collect('---\ntitle: T\ntags: [a, b]\n---\nUm texto quebrado em linhas.\n');
      const c = await collect('---\ntitle: T\ntags: [a, b]\n---\nUm texto diferente.\n');
      expect(a[0]?.normalized).toBe(b[0]?.normalized);
      expect(c[0]?.normalized).not.toBe(a[0]?.normalized);
    });

    it.each([
      ['an invalid id', '---\nid: rule-1\ntitle: T\n---\n'],
      ['an unknown key', '---\ntitle: T\nowner: maria\n---\n'],
      ['a malformed line', '---\ntitle: T\nthis is not yaml\n---\n'],
      ['an unterminated front-matter', '---\ntitle: T\n\nbody'],
      ['an empty title', '---\ntitle: ""\n---\n'],
    ])('warns and skips a file with %s', async (_label, content) => {
      const ctx = makeContext();
      expect(await collect(content, '.ruleprint/rules/bad.md', ctx)).toEqual([]);
      expect(ctx.warn.mock.calls).toHaveLength(1);
      expect(ctx.warn.mock.calls[0]?.[0]).toContain('.ruleprint/rules/bad.md');
    });
  });
});
