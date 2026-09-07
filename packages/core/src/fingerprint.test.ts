import { describe, expect, it } from 'vitest';

import type { RuleCandidate } from './collector.js';
import { fingerprintCandidate } from './fingerprint.js';

const base: RuleCandidate = {
  title: 'refund > within 7 days',
  origin: {
    collector: 'tests',
    confidence: 'derived',
    sources: [{ file: 'test/refund.spec.ts', line: 12, symbol: 'within 7 days', kind: 'test' }],
  },
};

describe('fingerprintCandidate() with a normalised origin', () => {
  const normalized: RuleCandidate = { ...base, normalized: '(call_expression identifier:it)' };

  it('hashes the normalised form and ignores title, file and symbol', async () => {
    const original = await fingerprintCandidate(normalized);
    const moved: RuleCandidate = {
      ...normalized,
      title: 'other title',
      origin: { ...normalized.origin, sources: [{ file: 'elsewhere.ts', line: 1, symbol: 'x' }] },
    };
    expect(await fingerprintCandidate(moved)).toBe(original);
    expect(
      await fingerprintCandidate({
        ...normalized,
        normalized: '(call_expression identifier:test)',
      }),
    ).not.toBe(original);
    expect(
      await fingerprintCandidate({
        ...normalized,
        origin: { ...normalized.origin, collector: 'ast' },
      }),
    ).not.toBe(original);
  });
});

describe('fingerprintCandidate()', () => {
  it('produces sha256: plus 64 hex chars', async () => {
    await expect(fingerprintCandidate(base)).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic and ignores the line number', async () => {
    const moved: RuleCandidate = {
      ...base,
      origin: { ...base.origin, sources: [{ ...base.origin.sources[0], line: 99 }] },
    };
    expect(await fingerprintCandidate(base)).toBe(await fingerprintCandidate(moved));
  });

  it('changes when the title, collector, file or symbol change', async () => {
    const original = await fingerprintCandidate(base);
    const variants: RuleCandidate[] = [
      { ...base, title: 'refund > within 8 days' },
      { ...base, origin: { ...base.origin, collector: 'ast' } },
      {
        ...base,
        origin: { ...base.origin, sources: [{ ...base.origin.sources[0], file: 'other.ts' }] },
      },
      {
        ...base,
        origin: { ...base.origin, sources: [{ ...base.origin.sources[0], symbol: 'other' }] },
      },
    ];
    for (const variant of variants) {
      expect(await fingerprintCandidate(variant)).not.toBe(original);
    }
  });
});
