import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { emptyLock, type LockFile } from '@ruleprint/core';
import { describe, expect, it } from 'vitest';

import { readLock, writeLock } from './lock-io.js';

describe('lock-io', () => {
  it('returns undefined when there is no lock', () => {
    expect(readLock(mkdtempSync(join(tmpdir(), 'ruleprint-lock-')))).toBeUndefined();
  });

  it('writes and reads back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ruleprint-lock-'));
    const lock: LockFile = {
      lockVersion: 1,
      rules: {
        'RP-000001': {
          title: 'a',
          collector: 'tests',
          fingerprint: `sha256:${'0'.repeat(64)}`,
          approvedAt: '2026-09-04T12:00:00.000Z',
        },
      },
    };
    writeLock(dir, lock);
    expect(readFileSync(join(dir, 'ruleprint.lock'), 'utf8')).toContain('"lockVersion": 1');
    expect(readLock(dir)).toEqual(lock);
    writeLock(dir, emptyLock());
    expect(readLock(dir)).toEqual(emptyLock());
  });

  it('fails loudly on a corrupt lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ruleprint-lock-'));
    writeFileSync(join(dir, 'ruleprint.lock'), '{ "lockVersion": 99 }');
    expect(() => readLock(dir)).toThrow(/ruleprint\.lock/);
  });
});
