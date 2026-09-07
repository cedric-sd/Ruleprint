import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validate } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import { scanProject } from './scan.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const GOLDEN = join(REPO_ROOT, 'examples/golden/fixture-express-api.ruleprint.json');
const NOW = new Date('2026-09-04T12:00:00Z');

describe('scanProject()', () => {
  it('produces a valid document for the fixture', async () => {
    const result = await scanProject(FIXTURE, { now: NOW, git: false });
    expect(validate(result.document)).toEqual({ valid: true, document: result.document });
    expect(result.document.project).toEqual({ name: 'fixture-express-api' });
    expect(result.document.generatedAt).toBe('2026-09-04T12:00:00.000Z');
    expect(result.document.rules).toHaveLength(15);
    expect(result.files).toBe(4);
    expect(result.warnings).toEqual([expect.stringContaining('broken.spec.ts') as string]);
  });

  it('matches the golden document (pnpm check:golden)', async () => {
    const result = await scanProject(FIXTURE, { now: NOW, git: false });
    await expect(`${JSON.stringify(result.document, null, 2)}\n`).toMatchFileSnapshot(GOLDEN);
  });

  it('reads the fixture lock and reports no changes', async () => {
    const result = await scanProject(FIXTURE, { now: NOW, git: false });
    expect(result.changes).toEqual([]);
    expect(result.document.rules.every((rule) => rule.status === 'approved')).toBe(true);
    expect(Object.keys(result.lock.rules)).toHaveLength(15);
  });

  it('can be told to ignore the lock', async () => {
    const result = await scanProject(FIXTURE, { now: NOW, git: false, lock: null });
    expect(result.changes).toHaveLength(15);
    expect(result.document.rules.every((rule) => rule.status === 'pending')).toBe(true);
  });

  it('is stable across runs', async () => {
    const first = await scanProject(FIXTURE, { now: NOW, git: false });
    const second = await scanProject(FIXTURE, { now: NOW, git: false });
    expect(second.document).toEqual(first.document);
  });

  it('uses the git commit and remote when available', async () => {
    const result = await scanProject(REPO_ROOT, { now: NOW, git: true });
    expect(result.document.project.name).toBe('ruleprint-monorepo');
    expect(result.document.project.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.document.project.repository).toBe('https://github.com/cedric-sd/Ruleprint');
    // the fixture golden is a valid document, so scanning this repo must include its own tests
    expect(result.document.rules.length).toBeGreaterThan(15);
  });

  it('keeps source paths relative to the git root when scanning a subdirectory', async () => {
    const result = await scanProject(FIXTURE, { now: NOW, git: true });
    const files = new Set(result.document.rules.map((rule) => rule.origin.sources[0].file));
    expect([...files].sort()).toEqual([
      'examples/fixture-express-api/test/broken.spec.ts',
      'examples/fixture-express-api/test/order.spec.ts',
      'examples/fixture-express-api/test/refund.spec.ts',
      'examples/fixture-express-api/test/shipping.spec.ts',
    ]);
    expect(result.warnings[0]).toContain('examples/fixture-express-api/test/broken.spec.ts');
  });

  it('falls back to the directory name when there is no package.json', async () => {
    const result = await scanProject(join(FIXTURE, 'test'), { now: NOW, git: false });
    expect(result.document.project.name).toBe('test');
    expect(result.document.rules).toHaveLength(15);
  });

  it('keeps the golden fixture readable by humans', () => {
    const golden = readFileSync(GOLDEN, 'utf8');
    expect(golden).toContain('"title": "shipping > frete grátis > acima de 300 reais no Sudeste"');
  });
});
