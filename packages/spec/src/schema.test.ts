import { describe, expect, it } from 'vitest';

import { SPEC_VERSION, schema } from './index.js';

describe('ruleprint.schema.json', () => {
  it('is a draft-07 schema published at the stable URL', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.$id).toBe('https://ruleprint.dev/schema/v0.json');
  });

  it('pins the spec version it describes', () => {
    expect(schema.properties.specVersion.const).toBe(SPEC_VERSION);
  });

  it('closes every object to unknown properties', () => {
    const objects = [schema, ...Object.values(schema.definitions)].filter(
      (node) => node.type === 'object',
    );
    expect(objects.length).toBeGreaterThan(0);
    for (const node of objects) {
      expect(node.additionalProperties).toBe(false);
    }
  });
});
