import { describe, expect, it } from 'vitest';

import { parseHash, ruleHash } from './route.js';

describe('routes', () => {
  it('parses a rule hash', () => {
    expect(parseHash('#/rules/RP-000042')).toEqual({ ruleId: 'RP-000042' });
    expect(parseHash(ruleHash('RP-000042'))).toEqual({ ruleId: 'RP-000042' });
  });

  it('treats everything else as the list', () => {
    expect(parseHash('')).toEqual({});
    expect(parseHash('#/')).toEqual({});
    expect(parseHash('#/rules/')).toEqual({});
  });
});
