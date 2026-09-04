import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validate } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');

/** Runs the CLI from its sources, resolving workspace packages to their sources too. */
function ruleprint(args: string[], cwd = FIXTURE): string {
  return execFileSync(TSX, [join(import.meta.dirname, 'bin.ts'), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--conditions=ruleprint-source' },
  });
}

describe('ruleprint (bin)', () => {
  it('scan writes ruleprint.json and prints a summary', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ruleprint-')), 'ruleprint.json');
    const stdout = ruleprint(['scan', '--out', out]);
    expect(stdout).toContain('15 rules');
    expect(existsSync(out)).toBe(true);
    const document: unknown = JSON.parse(readFileSync(out, 'utf8'));
    expect(validate(document).valid).toBe(true);
  });

  it('scan --json prints a machine-readable summary', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ruleprint-')), 'ruleprint.json');
    const summary = JSON.parse(ruleprint(['scan', '--out', out, '--json'])) as {
      out: string;
      rules: number;
      files: number;
      warnings: string[];
    };
    expect(summary).toMatchObject({ out, rules: 15, files: 4 });
    expect(summary.warnings).toHaveLength(1);
  });

  it('init scans and prints the next steps', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ruleprint-init-'));
    const stdout = ruleprint(['init', FIXTURE, '--out', join(dir, 'ruleprint.json')]);
    expect(stdout).toContain('15 rules');
    expect(stdout).toContain('ruleprint serve');
    expect(stdout).toContain('ruleprint build');
  });

  it('exits with code 2 on an unreadable directory', () => {
    let status: unknown;
    try {
      ruleprint(['scan', '/definitely/not/here']);
    } catch (error) {
      status = (error as { status?: unknown }).status;
    }
    expect(status).toBe(2);
  });

  it('prints help', () => {
    const stdout = ruleprint(['--help']);
    for (const command of ['init', 'scan', 'serve', 'build', 'check', 'approve']) {
      expect(stdout).toContain(command);
    }
  });
});
