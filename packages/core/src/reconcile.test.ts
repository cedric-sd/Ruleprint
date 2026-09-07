import { validate } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import type { RuleCandidate } from './collector.js';
import { fingerprintCandidate } from './fingerprint.js';
import { idForKey } from './ids.js';
import { emptyLock, type LockEntry, type LockFile } from './lock.js';
import { reconcile } from './reconcile.js';

function candidate(title: string, normalized: string, file = 'a.test.ts'): RuleCandidate {
  return {
    title,
    normalized,
    origin: {
      collector: 'tests',
      confidence: 'derived',
      sources: [{ file, line: 1, kind: 'test' }],
    },
  };
}

async function entryFor(c: RuleCandidate, approvedBy?: string): Promise<LockEntry> {
  const entry: LockEntry = {
    title: c.title,
    collector: c.origin.collector,
    fingerprint: await fingerprintCandidate(c),
    approvedAt: '2026-09-01T10:00:00.000Z',
  };
  return approvedBy === undefined ? entry : { ...entry, approvedBy };
}

function lockWith(entries: Record<string, LockEntry>): LockFile {
  return { lockVersion: 1, rules: entries };
}

const project = { name: 'p' };
const generatedAt = '2026-09-04T12:00:00.000Z';

async function assemble(candidates: RuleCandidate[], lock: LockFile) {
  return reconcile({ project, generatedAt, candidates, lock });
}

describe('reconcile()', () => {
  it('without a lock every rule is pending and added', async () => {
    const { document, changes } = await assemble(
      [candidate('a', 'body-a'), candidate('b', 'body-b')],
      emptyLock(),
    );
    expect(document.rules.map((r) => r.status)).toEqual(['pending', 'pending']);
    expect(changes.map((c) => c.kind)).toEqual(['added', 'added']);
    expect(document.rules[0]?.id).toBe(idForKey('tests', 'a'));
    expect(validate(document).valid).toBe(true);
  });

  it('marks a rule approved when title and fingerprint match the lock', async () => {
    const a = candidate('a', 'body-a');
    const lock = lockWith({ 'RP-000001': await entryFor(a, 'git:maria@empresa.com') });
    const { document, changes } = await assemble([a], lock);
    expect(changes).toEqual([]);
    expect(document.rules[0]).toMatchObject({
      id: 'RP-000001',
      status: 'approved',
      approvedAt: '2026-09-01T10:00:00.000Z',
      approvedBy: 'git:maria@empresa.com',
    });
  });

  it('keeps the locked id and reports changed when the body differs', async () => {
    const a = candidate('a', 'body-a');
    const lock = lockWith({ 'RP-000001': await entryFor(a) });
    const { document, changes } = await assemble([candidate('a', 'body-a-modified')], lock);
    expect(document.rules[0]).toMatchObject({ id: 'RP-000001', status: 'drifted' });
    expect(document.rules[0]?.approvedAt).toBeUndefined();
    expect(changes).toEqual([{ kind: 'changed', id: 'RP-000001', title: 'a' }]);
  });

  it('keeps the locked id and reports renamed when only the title differs', async () => {
    const a = candidate('a', 'body-a');
    const lock = lockWith({ 'RP-000001': await entryFor(a) });
    const { document, changes } = await assemble([candidate('a renamed', 'body-a')], lock);
    expect(document.rules[0]).toMatchObject({ id: 'RP-000001', status: 'drifted' });
    expect(changes).toEqual([
      { kind: 'renamed', id: 'RP-000001', title: 'a renamed', previousTitle: 'a' },
    ]);
  });

  it('reports removed for locked rules that disappeared', async () => {
    const a = candidate('a', 'body-a');
    const lock = lockWith({ 'RP-000001': await entryFor(a) });
    const { document, changes } = await assemble([], lock);
    expect(document.rules).toEqual([]);
    expect(changes).toEqual([{ kind: 'removed', id: 'RP-000001', title: 'a' }]);
  });

  it('does not match by fingerprint when two candidates share a body', async () => {
    const a = candidate('a', 'same-body');
    const lock = lockWith({ 'RP-000001': await entryFor(a) });
    const { changes } = await assemble(
      [candidate('x', 'same-body'), candidate('y', 'same-body')],
      lock,
    );
    expect(changes.map((c) => c.kind).sort()).toEqual(['added', 'added', 'removed']);
  });

  it('does not match by fingerprint when two locked rules share a body', async () => {
    const a = candidate('a', 'same-body');
    const b = candidate('b', 'same-body');
    const lock = lockWith({
      'RP-000001': await entryFor(a),
      'RP-000002': await entryFor(b),
    });
    const { changes } = await assemble([candidate('c', 'same-body')], lock);
    expect(changes.map((c) => c.kind).sort()).toEqual(['added', 'removed', 'removed']);
  });

  it('never hands a new rule an id the lock already uses', async () => {
    const a = candidate('a', 'body-a');
    const lock = lockWith({ [idForKey('tests', 'b')]: await entryFor(a) });
    const { document } = await assemble([a, candidate('b', 'body-b')], lock);
    const ids = document.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(idForKey('tests', 'b'));
    expect(document.rules.find((r) => r.title === 'b')?.id).not.toBe(idForKey('tests', 'b'));
  });

  it('orders changes by kind then id', async () => {
    const a = candidate('a', 'body-a');
    const b = candidate('b', 'body-b');
    const lock = lockWith({ 'RP-000001': await entryFor(a), 'RP-000002': await entryFor(b) });
    const { changes } = await assemble(
      [candidate('a', 'body-a-2'), candidate('new', 'body-new')],
      lock,
    );
    expect(changes.map((c) => c.kind)).toEqual(['added', 'changed', 'removed']);
  });
});
