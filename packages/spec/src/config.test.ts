import { describe, expect, it } from 'vitest';

import { configSchema, validateConfig } from './index.js';

function issuePaths(input: unknown): string[] {
  const result = validateConfig(input);
  if (result.valid) throw new Error('expected config to be invalid');
  return result.issues.map((issue) => issue.path);
}

describe('ruleprint.config.schema.json', () => {
  it('is a draft-07 schema with a stable id', () => {
    expect(configSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(configSchema.$id).toBe('https://ruleprint.dev/schema/config-v0.json');
  });
});

describe('validateConfig()', () => {
  it('accepts an empty config', () => {
    expect(validateConfig({})).toEqual({ valid: true, config: {} });
  });

  it('accepts an ast section with include, exclude and glossary', () => {
    const config = {
      ast: { include: ['src/domain/**'], exclude: ['src/domain/legacy/**'], glossary: ['freight'] },
    };
    expect(validateConfig(config)).toEqual({ valid: true, config });
  });

  it('requires at least one include glob', () => {
    expect(issuePaths({ ast: { include: [] } })).toContain('/ast/include');
    expect(issuePaths({ ast: {} })).toContain('/ast/include');
  });

  it('rejects unknown keys and wrong types', () => {
    expect(issuePaths({ collectors: [] })).toContain('/collectors');
    expect(issuePaths({ ast: { include: ['src/**'], glosary: [] } })).toContain('/ast/glosary');
    expect(issuePaths({ ast: { include: 'src/**' } })).toContain('/ast/include');
    expect(issuePaths({ ast: { include: [''] } })).toContain('/ast/include/0');
  });

  it('never throws on non-object input', () => {
    for (const input of [null, 42, 'x', []]) expect(validateConfig(input).valid).toBe(false);
  });
});
