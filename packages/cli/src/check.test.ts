import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseLock } from '@ruleprint/core';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function ruleprint(cwd: string, args: string[]): Run {
  const result = spawnSync(TSX, [join(import.meta.dirname, 'bin.ts'), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--conditions=ruleprint-source' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

interface CheckJson {
  approved: number;
  changes: { kind: string; id: string; title: string; previousTitle?: string }[];
}

function checkJson(cwd: string): { status: number | null; report: CheckJson } {
  const run = ruleprint(cwd, ['check', '--json']);
  return { status: run.status, report: JSON.parse(run.stdout) as CheckJson };
}

function edit(file: string, from: string | RegExp, to: string): void {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(from, to);
  if (after === before) throw new Error(`edit did nothing: ${String(from)}`);
  writeFileSync(file, after);
}

describe('ruleprint check / approve (definition of done)', () => {
  it('walks the whole lifecycle on a copy of the fixture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ruleprint-check-'));
    // The fixture is inside this git repository; a copy in tmp is outside any repo, so the
    // scan has no git information and paths are relative to the copy.
    cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith('ruleprint.lock') });
    const shipping = join(dir, 'test', 'shipping.spec.ts');

    // Nothing approved yet: every rule is a pending change.
    let check = checkJson(dir);
    expect(check.status).toBe(1);
    expect(check.report.approved).toBe(0);
    expect(check.report.changes.map((c) => c.kind)).toEqual(new Array<string>(15).fill('added'));
    expect(ruleprint(dir, ['check']).stderr).toContain('approve');

    // Approve everything.
    const approve = ruleprint(dir, ['approve', '--all', '--by', 'test:me']);
    expect(approve.status).toBe(0);
    expect(approve.stdout).toContain('15');
    const lock1 = parseLock(readFileSync(join(dir, 'ruleprint.lock'), 'utf8'));
    expect(Object.keys(lock1.rules)).toHaveLength(15);
    expect(Object.values(lock1.rules).every((e) => e.approvedBy === 'test:me')).toBe(true);
    check = checkJson(dir);
    expect(check.status).toBe(0);
    expect(check.report).toEqual({ approved: 15, changes: [] });

    // Reformatting is not drift: double quotes, no semicolons, other indentation, a comment.
    const original = readFileSync(shipping, 'utf8');
    const reformatted = original
      .replace(/'/g, '"')
      .replace(/;$/gm, '')
      .replace(/^ {2}/gm, '\t')
      .replace('describe("shipping"', '// reformatted on purpose\ndescribe("shipping"');
    writeFileSync(shipping, reformatted);
    check = checkJson(dir);
    expect(check.status).toBe(0);

    // Changing a condition is drift.
    edit(shipping, 'calcFreight(350, southeast)).toBe(0)', 'calcFreight(250, southeast)).toBe(0)');
    check = checkJson(dir);
    expect(check.status).toBe(1);
    expect(check.report.changes).toHaveLength(1);
    const changed = check.report.changes[0];
    expect(changed?.kind).toBe('changed');
    expect(changed?.title).toBe('shipping > frete grátis > acima de 300 reais no Sudeste');
    expect(ruleprint(dir, ['check']).stdout).toContain('changed');

    // Approving that single id clears it.
    expect(ruleprint(dir, ['approve', changed?.id ?? '']).status).toBe(0);
    check = checkJson(dir);
    expect(check.status).toBe(0);
    expect(
      parseLock(readFileSync(join(dir, 'ruleprint.lock'), 'utf8')).rules[changed?.id ?? '']
        ?.fingerprint,
    ).not.toBe(lock1.rules[changed?.id ?? '']?.fingerprint);

    // Renaming keeps the id but needs approval.
    edit(shipping, '"não vale fora do Sudeste"', '"só vale no Sudeste"');
    check = checkJson(dir);
    expect(check.status).toBe(1);
    expect(check.report.changes).toEqual([
      expect.objectContaining({
        kind: 'renamed',
        title: 'shipping > frete grátis > só vale no Sudeste',
        previousTitle: 'shipping > frete grátis > não vale fora do Sudeste',
      }),
    ]);
    const renamedId = check.report.changes[0]?.id ?? '';
    expect(lock1.rules[renamedId]?.title).toBe(
      'shipping > frete grátis > não vale fora do Sudeste',
    );
    expect(ruleprint(dir, ['approve', '--all']).status).toBe(0);
    expect(
      parseLock(readFileSync(join(dir, 'ruleprint.lock'), 'utf8')).rules[renamedId]?.title,
    ).toBe('shipping > frete grátis > só vale no Sudeste');

    // Deleting a test leaves an approved rule behind: removed.
    rmSync(join(dir, 'test', 'refund.spec.ts'));
    check = checkJson(dir);
    expect(check.status).toBe(1);
    expect(check.report.changes.map((c) => c.kind)).toEqual([
      'removed',
      'removed',
      'removed',
      'removed',
    ]);

    // Adding a test: added. Approving everything settles both.
    writeFileSync(
      join(dir, 'test', 'extra.spec.ts'),
      "import { it, expect } from 'vitest';\nit('cupom expirado é recusado', () => { expect(1).toBe(1); });\n",
    );
    check = checkJson(dir);
    expect(check.report.changes.map((c) => c.kind).sort()).toEqual([
      'added',
      'removed',
      'removed',
      'removed',
      'removed',
    ]);
    expect(ruleprint(dir, ['approve', '--all']).status).toBe(0);
    check = checkJson(dir);
    expect(check.status).toBe(0);
    expect(check.report.approved).toBe(12);
  });

  it('exits 2 on a corrupt lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ruleprint-check-'));
    cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith('ruleprint.lock') });
    writeFileSync(join(dir, 'ruleprint.lock'), 'nope');
    const run = ruleprint(dir, ['check']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('ruleprint.lock');
  });
});
