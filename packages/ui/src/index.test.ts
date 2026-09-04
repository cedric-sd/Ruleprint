import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@ruleprint/ui', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@ruleprint/ui');
  });
});
