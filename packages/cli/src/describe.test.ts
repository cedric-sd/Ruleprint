import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { describeRule } from './describe.js';
import { scanProject } from './scan.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');

function freshFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ruleprint-describe-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith('ruleprint.lock') });
  return dir;
}

async function ruleTitled(dir: string, title: string) {
  const scan = await scanProject(dir, { git: false });
  const rule = scan.document.rules.find((r) => r.title === title);
  if (!rule) throw new Error(`rule not found: ${title}`);
  return rule;
}

describe('describeRule()', () => {
  it('declares a derived rule with the description, keeping its group (ADR-0009)', async () => {
    const dir = freshFixture();
    const target = await ruleTitled(dir, 'order validation > rejects an empty order');
    expect(target.group).toBe('order validation');

    const result = await describeRule(dir, target.id, 'Um pedido precisa de ao menos um item.', {
      scanOptions: { git: false },
    });
    expect(result.path).toBe(
      join(dir, '.ruleprint/rules/order-validation-rejects-an-empty-order.md'),
    );
    expect(result.created).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toBe(
      [
        '---',
        `id: ${target.id}`,
        'title: order validation > rejects an empty order',
        '---',
        '',
        'Um pedido precisa de ao menos um item.',
        '',
      ].join('\n'),
    );

    const after = await scanProject(dir, { git: false });
    const rule = after.document.rules.find((r) => r.id === target.id);
    expect(rule).toMatchObject({
      title: 'order validation > rejects an empty order',
      description: 'Um pedido precisa de ao menos um item.',
      group: 'order validation',
      origin: { collector: 'config', confidence: 'declared' },
      evidence: { tests: ['order validation > rejects an empty order'] },
    });
    expect(result.rule).toEqual(rule);
  });

  it('rewrites only the body of a rule that is already declared', async () => {
    const dir = freshFixture();
    const file = join(dir, '.ruleprint/rules/frete-sudeste.md');
    const before = readFileSync(file, 'utf8');
    const frontMatter = before.slice(0, before.indexOf('---', 3) + 3);

    const result = await describeRule(dir, 'RP-088272', 'Vale só para CEPs do Sudeste.\n', {
      scanOptions: { git: false },
    });
    expect(result.path).toBe(file);
    expect(result.created).toBe(false);
    const written = readFileSync(file, 'utf8');
    expect(written.startsWith(frontMatter)).toBe(true);
    expect(written).toBe(`${frontMatter}\n\nVale só para CEPs do Sudeste.\n`);

    const rule = await ruleTitled(dir, 'Pedido acima de R$300 tem frete grátis no Sudeste');
    expect(rule.id).toBe('RP-088272');
    expect(rule.description).toBe('Vale só para CEPs do Sudeste.');
    expect(rule.tags).toEqual(['frete', 'checkout']);
  });

  it('refuses an empty description and an unknown id', async () => {
    const dir = freshFixture();
    await expect(
      describeRule(dir, 'RP-999999', 'x', { scanOptions: { git: false } }),
    ).rejects.toThrow('RP-999999 is not a rule');
    const target = await ruleTitled(dir, 'order validation > rejects an empty order');
    await expect(
      describeRule(dir, target.id, '   ', { scanOptions: { git: false } }),
    ).rejects.toThrow('description is empty');
    expect(
      existsSync(join(dir, '.ruleprint/rules/order-validation-rejects-an-empty-order.md')),
    ).toBe(false);
  });

  it('is exposed as `ruleprint describe <id> <text>`', async () => {
    const dir = freshFixture();
    const target = await ruleTitled(dir, 'refund > ignora cobranças com valor zero');
    const run = spawnSync(
      TSX,
      [join(import.meta.dirname, 'bin.ts'), 'describe', target.id, 'Valor zero não gera estorno.'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '--conditions=ruleprint-source' },
      },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(target.id);
    expect(run.stdout).toContain('.ruleprint/rules/');
    const rule = (await scanProject(dir, { git: false })).document.rules.find(
      (r) => r.id === target.id,
    );
    expect(rule?.description).toBe('Valor zero não gera estorno.');
    expect(rule?.origin.confidence).toBe('declared');
  });
});
