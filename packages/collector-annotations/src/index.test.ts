import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@ruleprint/collector-annotations', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@ruleprint/collector-annotations');
  });
});
