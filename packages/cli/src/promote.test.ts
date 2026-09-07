import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { promoteRule } from './promote.js';
import { scanProject } from './scan.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');

function freshFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ruleprint-promote-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith('ruleprint.lock') });
  return dir;
}

describe('promoteRule()', () => {
  it('writes a declared rule file that takes over the rule on the next scan', async () => {
    const dir = freshFixture();
    const before = await scanProject(dir, { git: false });
    const target = before.document.rules.find(
      (r) => r.title === 'order validation > rejects an empty order',
    );
    if (!target) throw new Error('rule not found');

    const result = await promoteRule(dir, target.id, { scanOptions: { git: false } });
    expect(result.path).toBe(
      join(dir, '.ruleprint/rules/order-validation-rejects-an-empty-order.md'),
    );
    const text = readFileSync(result.path, 'utf8');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain(`id: ${target.id}`);
    expect(text).toContain('title: order validation > rejects an empty order');

    const after = await scanProject(dir, { git: false });
    const promoted = after.document.rules.find((r) => r.id === target.id);
    expect(promoted).toMatchObject({
      title: 'order validation > rejects an empty order',
      origin: { collector: 'config', confidence: 'declared' },
    });
    expect(promoted?.origin.sources.map((s) => s.kind)).toEqual(['config', 'test']);
    expect(promoted?.status).toBe('pending');
  });

  it('keeps description and tags when the rule already has them', async () => {
    const dir = freshFixture();
    const before = await scanProject(dir, { git: false });
    const cupom = before.document.rules.find((r) => r.status === 'orphan');
    if (!cupom) throw new Error('orphan not found');
    await expect(promoteRule(dir, cupom.id, { scanOptions: { git: false } })).rejects.toThrow(
      /already declared/,
    );
  });

  it('rejects unknown ids', async () => {
    const dir = freshFixture();
    await expect(promoteRule(dir, 'RP-999999', { scanOptions: { git: false } })).rejects.toThrow(
      /RP-999999/,
    );
    expect(existsSync(join(dir, '.ruleprint/rules'))).toBe(true);
  });

  it('is exposed as `ruleprint promote <id>`', async () => {
    const dir = freshFixture();
    const before = await scanProject(dir, { git: false });
    const target = before.document.rules.find(
      (r) => r.title === 'refund > janela de 7 dias > permite reembolso dentro da janela',
    );
    const run = spawnSync(TSX, [join(import.meta.dirname, 'bin.ts'), 'promote', target?.id ?? ''], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--conditions=ruleprint-source' },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('.ruleprint/rules/');
    const missing = spawnSync(TSX, [join(import.meta.dirname, 'bin.ts'), 'promote', 'RP-999999'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--conditions=ruleprint-source' },
    });
    expect(missing.status).toBe(2);
  });
});
