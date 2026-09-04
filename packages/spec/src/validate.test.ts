import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SPEC_VERSION, validate } from './index.js';

const GOLDEN_DIR = join(import.meta.dirname, '../../../examples/golden');
const INVALID_DIR = join(import.meta.dirname, '../test/fixtures/invalid');

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function issuePaths(input: unknown): string[] {
  const result = validate(input);
  if (result.valid) {
    throw new Error('expected document to be invalid');
  }
  return result.issues.map((issue) => issue.path);
}

describe('validate()', () => {
  describe('accepts every golden document', () => {
    const files = jsonFiles(GOLDEN_DIR);

    it('has the four golden fixtures', () => {
      expect(files).toEqual([
        'checkout-service.ruleprint.json',
        'fixture-express-api.ruleprint.json',
        'legacy-billing.ruleprint.json',
        'minimal.ruleprint.json',
      ]);
    });

    it.each(files)('%s', (file) => {
      const result = validate(readJson(GOLDEN_DIR, file));
      expect(result).toEqual({ valid: true, document: expect.anything() as unknown });
      if (result.valid) {
        expect(result.document.specVersion).toBe(SPEC_VERSION);
      }
    });
  });

  it('accepts a document with no rules', () => {
    const result = validate({
      specVersion: '0.1',
      project: { name: 'empty' },
      generatedAt: '2026-09-04T12:00:00Z',
      rules: [],
    });
    expect(result.valid).toBe(true);
  });

  describe('rejects every invalid fixture', () => {
    it('has the three invalid fixtures', () => {
      expect(jsonFiles(INVALID_DIR)).toEqual([
        'invalid-enum-values.json',
        'malformed-identifiers.json',
        'missing-required-fields.json',
      ]);
    });

    it('missing-required-fields.json: reports each missing property by path', () => {
      const paths = issuePaths(readJson(INVALID_DIR, 'missing-required-fields.json'));
      expect(paths).toEqual(
        expect.arrayContaining([
          '/generatedAt',
          '/project/name',
          '/rules/0/title',
          '/rules/0/fingerprint',
          '/rules/0/origin/sources',
        ]),
      );
    });

    it('invalid-enum-values.json: reports each enum violation and lists the allowed values', () => {
      const result = validate(readJson(INVALID_DIR, 'invalid-enum-values.json'));
      expect(result.valid).toBe(false);
      if (result.valid) return;

      const byPath = new Map(result.issues.map((issue) => [issue.path, issue.message]));
      expect([...byPath.keys()]).toEqual(
        expect.arrayContaining([
          '/rules/0/origin/confidence',
          '/rules/0/origin/sources/0/kind',
          '/rules/0/evidence/lastRunStatus',
          '/rules/0/status',
        ]),
      );
      expect(byPath.get('/rules/0/origin/confidence')).toContain('declared, derived, inferred');
      expect(byPath.get('/rules/0/status')).toContain('approved, pending, drifted, orphan');
    });

    it('malformed-identifiers.json: reports version, patterns, formats and unknown keys', () => {
      const paths = issuePaths(readJson(INVALID_DIR, 'malformed-identifiers.json'));
      expect(paths).toEqual(
        expect.arrayContaining([
          '/specVersion',
          '/project/name',
          '/project/commit',
          '/project/repository',
          '/generatedAt',
          '/extra',
          '/rules/0/id',
          '/rules/0/tags',
          '/rules/0/origin/collector',
          '/rules/0/origin/sources/0/file',
          '/rules/0/origin/sources/0/line',
          '/rules/0/fingerprint',
        ]),
      );
    });
  });

  it('rejects duplicate rule ids even when the schema is satisfied', () => {
    const golden = readJson(GOLDEN_DIR, 'minimal.ruleprint.json') as { rules: unknown[] };
    const [rule] = golden.rules;
    const result = validate({ ...golden, rules: [rule, rule] });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues).toEqual([
      {
        path: '/rules/1/id',
        keyword: 'uniqueRuleId',
        message: expect.stringContaining('RP-0001') as string,
      },
    ]);
  });

  it('rejects non-object inputs without throwing', () => {
    for (const input of [null, undefined, 42, 'text', [], true]) {
      const result = validate(input);
      expect(result.valid).toBe(false);
    }
  });

  it('exposes the spec version', () => {
    expect(SPEC_VERSION).toBe('0.1');
  });
});
