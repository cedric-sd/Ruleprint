import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { approveProject } from './approve.js';
import { readLock } from './lock-io.js';
import { scanProject } from './scan.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const NOW = new Date('2026-09-04T12:00:00Z');

function freshFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ruleprint-approve-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith('ruleprint.lock') });
  return dir;
}

describe('approveProject()', () => {
  it('--all writes the lock and a ruleprint.json where everything is approved', async () => {
    const dir = freshFixture();
    const before = await scanProject(dir, { now: NOW, git: false });
    expect(before.changes.map((c) => c.kind)).toEqual(new Array<string>(15).fill('added'));

    const result = await approveProject(dir, {
      all: true,
      now: NOW,
      approvedBy: 'test:me',
      scanOptions: { git: false },
    });
    expect(result.applied).toHaveLength(15);
    expect(Object.keys(readLock(dir)?.rules ?? {})).toHaveLength(15);
    expect(existsSync(join(dir, 'ruleprint.json'))).toBe(true);
    const written = JSON.parse(readFileSync(join(dir, 'ruleprint.json'), 'utf8')) as {
      rules: { status: string; approvedBy?: string; approvedAt?: string }[];
    };
    expect(written.rules.every((r) => r.status === 'approved')).toBe(true);
    expect(written.rules[0]).toMatchObject({
      approvedBy: 'test:me',
      approvedAt: NOW.toISOString(),
    });

    const after = await scanProject(dir, { now: NOW, git: false });
    expect(after.changes).toEqual([]);
  });

  it('approves only the given ids', async () => {
    const dir = freshFixture();
    const scan = await scanProject(dir, { now: NOW, git: false });
    const [first, second] = scan.changes;
    if (!first || !second) throw new Error('expected changes');
    const result = await approveProject(dir, {
      ids: [first.id, second.id],
      now: NOW,
      scanOptions: { git: false },
    });
    expect(result.applied.map((c) => c.id)).toEqual([first.id, second.id]);
    expect(Object.keys(readLock(dir)?.rules ?? {}).sort()).toEqual([first.id, second.id].sort());
    const after = await scanProject(dir, { now: NOW, git: false });
    expect(after.changes).toHaveLength(13);
  });

  it('rejects unknown ids without touching the lock', async () => {
    const dir = freshFixture();
    await expect(
      approveProject(dir, { ids: ['RP-999999'], now: NOW, scanOptions: { git: false } }),
    ).rejects.toThrow(/RP-999999/);
    expect(readLock(dir)).toBeUndefined();
  });
});
