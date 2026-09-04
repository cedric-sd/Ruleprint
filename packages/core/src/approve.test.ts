import { describe, expect, it } from 'vitest';

import { applyApprovals } from './approve.js';
import type { RuleCandidate } from './collector.js';
import { fingerprintCandidate } from './fingerprint.js';
import { emptyLock, type LockFile } from './lock.js';
import { reconcile } from './reconcile.js';

function candidate(title: string, normalized: string): RuleCandidate {
  return {
    title,
    normalized,
    origin: {
      collector: 'tests',
      confidence: 'derived',
      sources: [{ file: 'a.test.ts', kind: 'test' }],
    },
  };
}

const project = { name: 'p' };
const generatedAt = '2026-09-04T12:00:00.000Z';
const approvedAt = '2026-09-04T13:00:00.000Z';

describe('applyApprovals()', () => {
  it('--all approves every change and writes title, collector, fingerprint and who/when', async () => {
    const a = candidate('a', 'body-a');
    const { document, changes } = await reconcile({
      project,
      generatedAt,
      candidates: [a],
      lock: emptyLock(),
    });
    const lock = applyApprovals(emptyLock(), document, changes, {
      all: true,
      approvedAt,
      approvedBy: 'git:maria@empresa.com',
    });
    const [id] = Object.keys(lock.rules);
    expect(lock.rules[id ?? '']).toEqual({
      title: 'a',
      collector: 'tests',
      fingerprint: await fingerprintCandidate(a),
      approvedAt,
      approvedBy: 'git:maria@empresa.com',
    });
  });

  it('approves only the given ids and leaves the rest pending', async () => {
    const { document, changes } = await reconcile({
      project,
      generatedAt,
      candidates: [candidate('a', 'body-a'), candidate('b', 'body-b')],
      lock: emptyLock(),
    });
    const idA = document.rules.find((r) => r.title === 'a')?.id ?? '';
    const lock = applyApprovals(emptyLock(), document, changes, { ids: [idA], approvedAt });
    expect(Object.keys(lock.rules)).toEqual([idA]);
    expect(lock.rules[idA]?.approvedBy).toBeUndefined();
  });

  it('rejects an id that is not a pending change', async () => {
    const { document, changes } = await reconcile({
      project,
      generatedAt,
      candidates: [candidate('a', 'body-a')],
      lock: emptyLock(),
    });
    expect(() =>
      applyApprovals(emptyLock(), document, changes, { ids: ['RP-999999'], approvedAt }),
    ).toThrow(/RP-999999/);
  });

  it('updates changed and renamed rules and deletes removed ones', async () => {
    const a = candidate('a', 'body-a');
    const b = candidate('b', 'body-b');
    const c = candidate('c', 'body-c');
    const first = await reconcile({
      project,
      generatedAt,
      candidates: [a, b, c],
      lock: emptyLock(),
    });
    const lock1: LockFile = applyApprovals(emptyLock(), first.document, first.changes, {
      all: true,
      approvedAt,
    });

    const second = await reconcile({
      project,
      generatedAt,
      candidates: [candidate('a', 'body-a-2'), candidate('b renamed', 'body-b')],
      lock: lock1,
    });
    expect(second.changes.map((ch) => ch.kind).sort()).toEqual(['changed', 'removed', 'renamed']);

    const lock2 = applyApprovals(lock1, second.document, second.changes, {
      all: true,
      approvedAt: '2026-09-05T00:00:00.000Z',
    });
    const idA = first.document.rules.find((r) => r.title === 'a')?.id ?? '';
    const idB = first.document.rules.find((r) => r.title === 'b')?.id ?? '';
    const idC = first.document.rules.find((r) => r.title === 'c')?.id ?? '';
    expect(Object.keys(lock2.rules).sort()).toEqual([idA, idB].sort());
    expect(lock2.rules[idA]?.fingerprint).toBe(
      await fingerprintCandidate(candidate('a', 'body-a-2')),
    );
    expect(lock2.rules[idB]?.title).toBe('b renamed');
    expect(lock2.rules[idC]).toBeUndefined();

    const third = await reconcile({
      project,
      generatedAt,
      candidates: [candidate('a', 'body-a-2'), candidate('b renamed', 'body-b')],
      lock: lock2,
    });
    expect(third.changes).toEqual([]);
    expect(third.document.rules.every((r) => r.status === 'approved')).toBe(true);
  });
});
