import { describe, expect, it } from 'vitest';

import type { RuleCandidate } from './collector.js';
import { assignIds, idForKey } from './ids.js';

function candidate(title: string, collector = 'tests', file = 'a.test.ts'): RuleCandidate {
  return {
    title,
    origin: { collector, confidence: 'derived', sources: [{ file, line: 1, kind: 'test' }] },
  };
}

describe('idForKey()', () => {
  it('produces RP- plus six digits', () => {
    expect(idForKey('tests', 'checkout > frete grátis')).toMatch(/^RP-\d{6}$/);
  });

  it('is deterministic', () => {
    expect(idForKey('tests', 'a')).toBe(idForKey('tests', 'a'));
  });

  it('depends on both collector and title', () => {
    expect(idForKey('tests', 'a')).not.toBe(idForKey('ast', 'a'));
    expect(idForKey('tests', 'a')).not.toBe(idForKey('tests', 'b'));
  });
});

describe('assignIds()', () => {
  it('returns one id per candidate, in order', () => {
    const ids = assignIds([candidate('a'), candidate('b'), candidate('c')]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(idForKey('tests', 'a'));
  });

  it('does not depend on the order of the input', () => {
    const [a1, b1] = assignIds([candidate('a'), candidate('b')]);
    const [b2, a2] = assignIds([candidate('b'), candidate('a')]);
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it('resolves a collision by taking the next free number', () => {
    const [first, second] = assignIds([candidate('same'), candidate('same', 'tests', 'b.test.ts')]);
    expect(first).toBe(idForKey('tests', 'same'));
    expect(second).not.toBe(first);
    const next = (Number(first?.slice(3)) + 1) % 1_000_000;
    expect(second).toBe(`RP-${String(next).padStart(6, '0')}`);
  });
});
