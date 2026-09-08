import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectorsFor, readConfig } from './config.js';

function dirWithConfig(text?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ruleprint-config-'));
  if (text !== undefined) {
    mkdirSync(join(dir, '.ruleprint'), { recursive: true });
    writeFileSync(join(dir, '.ruleprint', 'config.json'), text);
  }
  return dir;
}

describe('readConfig()', () => {
  it('is empty when there is no file', () => {
    expect(readConfig(dirWithConfig())).toEqual({});
  });

  it('reads and validates the file', () => {
    expect(readConfig(dirWithConfig('{ "ast": { "include": ["src/**"] } }'))).toEqual({
      ast: { include: ['src/**'] },
    });
  });

  it.each([
    ['invalid JSON', '{ "ast": '],
    ['an empty include', '{ "ast": { "include": [] } }'],
    ['an unknown key', '{ "collectors": [] }'],
  ])('fails loudly on %s', (_label, text) => {
    expect(() => readConfig(dirWithConfig(text))).toThrow(/\.ruleprint\/config\.json/);
  });
});

describe('collectorsFor()', () => {
  it('always runs tests, config and annotations', () => {
    expect(collectorsFor({}).map((c) => c.name)).toEqual(['tests', 'config', 'annotations']);
  });

  it('adds the AST collector when configured', () => {
    expect(collectorsFor({ ast: { include: ['src/**'] } }).map((c) => c.name)).toEqual([
      'tests',
      'config',
      'annotations',
      'ast',
    ]);
  });
});
