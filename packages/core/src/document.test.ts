import { validate } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import type { RuleCandidate } from './collector.js';
import { assembleDocument } from './document.js';

function candidate(title: string, file: string, line: number): RuleCandidate {
  return {
    title,
    tags: ['checkout'],
    origin: {
      collector: 'tests',
      confidence: 'derived',
      sources: [{ file, line, symbol: title, kind: 'test' }],
    },
    evidence: { tests: [title] },
  };
}

const project = {
  name: 'checkout-service',
  commit: 'a1b2c3d',
  repository: 'https://github.com/empresa/checkout-service',
};
const generatedAt = '2026-09-04T12:00:00Z';

describe('assembleDocument()', () => {
  it('produces a document that validates against the spec', async () => {
    const { document } = await assembleDocument({
      project,
      generatedAt,
      candidates: [candidate('b', 'b.test.ts', 1), candidate('a', 'a.test.ts', 1)],
    });
    expect(validate(document)).toEqual({ valid: true, document });
    expect(document.specVersion).toBe('0.1');
    expect(document.project).toEqual(project);
    expect(document.generatedAt).toBe(generatedAt);
  });

  it('sorts rules by collector, title, file and line and marks them pending', async () => {
    const { document } = await assembleDocument({
      project,
      generatedAt,
      candidates: [
        candidate('b', 'b.test.ts', 5),
        candidate('a', 'z.test.ts', 9),
        candidate('a', 'a.test.ts', 2),
      ],
    });
    expect(document.rules.map((r) => [r.title, r.origin.sources[0].file])).toEqual([
      ['a', 'a.test.ts'],
      ['a', 'z.test.ts'],
      ['b', 'b.test.ts'],
    ]);
    expect(document.rules.every((r) => r.status === 'pending')).toBe(true);
  });

  it('assigns unique ids and fingerprints and keeps the candidate fields', async () => {
    const { document } = await assembleDocument({
      project,
      generatedAt,
      candidates: [candidate('a', 'a.test.ts', 1), candidate('a', 'b.test.ts', 1)],
    });
    expect(new Set(document.rules.map((r) => r.id)).size).toBe(2);
    expect(document.rules.map((r) => r.fingerprint)).toEqual([
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    ]);
    expect(document.rules[0]).toMatchObject({
      title: 'a',
      tags: ['checkout'],
      evidence: { tests: ['a'] },
      origin: { collector: 'tests', confidence: 'derived' },
    });
  });

  it('drops exact duplicates', async () => {
    const { document } = await assembleDocument({
      project,
      generatedAt,
      candidates: [candidate('a', 'a.test.ts', 1), candidate('a', 'a.test.ts', 1)],
    });
    expect(document.rules).toHaveLength(1);
  });

  it('accepts an empty candidate list', async () => {
    const { document } = await assembleDocument({
      project: { name: 'empty' },
      generatedAt,
      candidates: [],
    });
    expect(document.rules).toEqual([]);
    expect(validate(document).valid).toBe(true);
  });
});
