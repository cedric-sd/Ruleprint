import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validate } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import { buildSite } from './build.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');

describe('buildSite()', () => {
  it('copies the UI and writes the document next to it', async () => {
    const uiDist = mkdtempSync(join(tmpdir(), 'ruleprint-ui-'));
    writeFileSync(join(uiDist, 'index.html'), '<!doctype html>');
    mkdirSync(join(uiDist, 'assets'));
    writeFileSync(join(uiDist, 'assets', 'app.js'), '');
    const out = join(mkdtempSync(join(tmpdir(), 'ruleprint-site-')), 'site');

    const result = await buildSite({ dir: FIXTURE, out, uiDist, scanOptions: { git: false } });

    expect(result.rules).toBe(15);
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'assets', 'app.js'))).toBe(true);
    const document: unknown = JSON.parse(readFileSync(join(out, 'ruleprint.json'), 'utf8'));
    expect(validate(document).valid).toBe(true);
  });
});
