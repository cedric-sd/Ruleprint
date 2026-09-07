import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { annotationsCollector } from './index.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');

function makeContext() {
  return { warn: vi.fn<(message: string) => void>() };
}

async function collect(content: string, path = 'src/a.ts', ctx = makeContext()) {
  return annotationsCollector.collect({ path, content }, ctx);
}

describe('annotationsCollector', () => {
  it('is named "annotations"', () => {
    expect(annotationsCollector.name).toBe('annotations');
  });

  describe('match()', () => {
    it.each([
      'src/a.ts',
      'src/a.tsx',
      'lib/b.js',
      'app/c.py',
      'Main.java',
      'pkg/d.go',
      'x.rb',
      'y.php',
      'z.cs',
      'k.kt',
      'r.rs',
      's.swift',
      'c.c',
      'h.h',
      'p.cpp',
    ])('matches %s', (path) => {
      expect(annotationsCollector.match(path)).toBe(true);
    });
    it.each([
      'README.md',
      'ruleprint.json',
      'package.json',
      'styles.css',
      'image.png',
      'test/a.spec.ts',
    ])('does not match %s', (path) => {
      expect(annotationsCollector.match(path)).toBe(false);
    });
  });

  it('links the fixture shipping module to RP-088272', async () => {
    const content = readFileSync(join(FIXTURE, 'src/shipping.ts'), 'utf8');
    const links = await collect(content, 'src/shipping.ts');
    expect(links).toMatchSnapshot();
    expect(links).toEqual([
      {
        attachTo: 'RP-088272',
        title: '@rule RP-088272',
        origin: {
          collector: 'annotations',
          confidence: 'inferred',
          sources: [
            { file: 'src/shipping.ts', line: expect.any(Number) as number, kind: 'annotation' },
          ],
        },
      },
    ]);
  });

  it('understands the usual comment styles and several ids on one line', async () => {
    const source = [
      '// @rule RP-000001',
      '# @rule RP-000002 python style',
      '/* @rule RP-000003 */',
      ' * @rule RP-000004, RP-000005 in a doc comment',
      'const notAComment = "@rule RP-000006";',
      '// see @rule RP-000007 later in the line',
    ].join('\n');
    const links = await collect(source);
    expect(links.map((l) => [l.attachTo, l.origin.sources[0].line])).toEqual([
      ['RP-000001', 1],
      ['RP-000002', 2],
      ['RP-000003', 3],
      ['RP-000004', 4],
      ['RP-000005', 4],
      ['RP-000007', 6],
    ]);
  });

  it('warns about a @rule without a valid id and ignores it', async () => {
    const ctx = makeContext();
    const links = await collect('// @rule frete grátis\n// @rule RP-12\n', 'src/x.ts', ctx);
    expect(links).toEqual([]);
    expect(ctx.warn.mock.calls.map((c) => c[0])).toEqual([
      'src/x.ts:1: @rule needs a rule id like RP-000042',
      'src/x.ts:2: @rule needs a rule id like RP-000042',
    ]);
  });

  it('returns nothing for a file without annotations', async () => {
    expect(await collect('export const a = 1;\n')).toEqual([]);
  });
});
