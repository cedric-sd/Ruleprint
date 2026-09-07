import { describe, expect, it } from 'vitest';

import { exitCodeFor, summarizeChanges } from './check.js';
import type { Change } from './reconcile.js';

const changes: Change[] = [
  { kind: 'added', id: 'RP-000001', title: 'a' },
  { kind: 'added', id: 'RP-000002', title: 'b' },
  { kind: 'changed', id: 'RP-000003', title: 'c' },
  { kind: 'renamed', id: 'RP-000004', title: 'd2', previousTitle: 'd' },
  { kind: 'removed', id: 'RP-000005', title: 'e' },
];

describe('check', () => {
  it('summarises changes by kind', () => {
    expect(summarizeChanges(changes)).toEqual({ added: 2, changed: 1, renamed: 1, removed: 1 });
    expect(summarizeChanges([])).toEqual({ added: 0, changed: 0, renamed: 0, removed: 0 });
  });

  it('exits 0 without changes and 1 with any', () => {
    expect(exitCodeFor([])).toBe(0);
    expect(exitCodeFor(changes)).toBe(1);
    expect(exitCodeFor([{ kind: 'removed', id: 'RP-000005', title: 'e' }])).toBe(1);
  });
});
