import { describe, expect, it } from 'vitest';

import type { Collector, RuleCandidate, SourceFile } from './collector.js';
import { collectFromFiles } from './pipeline.js';

function fakeCollector(name: string, extension: string, async = false): Collector {
  return {
    name,
    match: (path) => path.endsWith(extension),
    collect: (file, ctx) => {
      if (file.content === 'bad') {
        ctx.warn(`${name}: ${file.path} is bad`);
        return [];
      }
      const candidate: RuleCandidate = {
        title: `${name}:${file.path}`,
        origin: { collector: name, confidence: 'inferred', sources: [{ file: file.path }] },
      };
      return async ? Promise.resolve([candidate]) : [candidate];
    },
  };
}

const files: SourceFile[] = [
  { path: 'a.spec.ts', content: 'ok' },
  { path: 'b.md', content: 'ok' },
  { path: 'c.spec.ts', content: 'bad' },
  { path: 'd.txt', content: 'ok' },
];

describe('collectFromFiles()', () => {
  it('runs every matching collector on every matching file, in file order', async () => {
    const warnings: string[] = [];
    const candidates = await collectFromFiles(
      files,
      [fakeCollector('tests', '.spec.ts'), fakeCollector('config', '.md', true)],
      { warn: (message) => warnings.push(message) },
    );
    expect(candidates.map((c) => c.title)).toEqual(['tests:a.spec.ts', 'config:b.md']);
    expect(warnings).toEqual(['tests: c.spec.ts is bad']);
  });

  it('returns nothing when no collector matches', async () => {
    const candidates = await collectFromFiles(files, [fakeCollector('none', '.zzz')], {
      warn: () => undefined,
    });
    expect(candidates).toEqual([]);
  });
});
