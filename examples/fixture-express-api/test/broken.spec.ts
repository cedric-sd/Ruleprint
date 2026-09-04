import { describe, expect, it } from 'vitest';

describe('broken file', () => {
  it('still yields the rule before the syntax error', () => {
    expect(1).toBe(1);
  });

  it('is cut short', () => {
    expect(1).toBe(
  });
});
