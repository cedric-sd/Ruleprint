import { describe, expect, it } from 'vitest';

import { emptyLock, LOCK_VERSION, parseLock, serializeLock, type LockFile } from './lock.js';

const FP = `sha256:${'a'.repeat(64)}`;

const lock: LockFile = {
  lockVersion: 1,
  rules: {
    'RP-000002': {
      title: 'b',
      collector: 'tests',
      fingerprint: FP,
      approvedAt: '2026-09-04T12:00:00.000Z',
    },
    'RP-000001': {
      title: 'a',
      collector: 'tests',
      fingerprint: FP,
      approvedAt: '2026-09-04T12:00:00.000Z',
      approvedBy: 'git:maria@empresa.com',
    },
  },
};

describe('ruleprint.lock', () => {
  it('starts empty at the current version', () => {
    expect(emptyLock()).toEqual({ lockVersion: LOCK_VERSION, rules: {} });
  });

  it('serialises with sorted ids, two-space indent and a trailing newline', () => {
    const text = serializeLock(lock);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('RP-000001')).toBeLessThan(text.indexOf('RP-000002'));
    expect(text).toContain('  "lockVersion": 1,');
  });

  it('round-trips', () => {
    expect(parseLock(serializeLock(lock))).toEqual({
      lockVersion: 1,
      rules: { 'RP-000001': lock.rules['RP-000001'], 'RP-000002': lock.rules['RP-000002'] },
    });
  });

  it.each([
    ['not json', '{'],
    ['not an object', '[]'],
    ['wrong version', JSON.stringify({ lockVersion: 2, rules: {} })],
    ['bad id', JSON.stringify({ lockVersion: 1, rules: { 'rule-1': lock.rules['RP-000001'] } })],
    [
      'bad fingerprint',
      JSON.stringify({
        lockVersion: 1,
        rules: { 'RP-000001': { ...lock.rules['RP-000001'], fingerprint: 'md5:x' } },
      }),
    ],
    [
      'missing title',
      JSON.stringify({
        lockVersion: 1,
        rules: { 'RP-000001': { collector: 'tests', fingerprint: FP, approvedAt: 'x' } },
      }),
    ],
  ])('rejects %s', (_label, text) => {
    expect(() => parseLock(text)).toThrow(/ruleprint\.lock/);
  });
});
