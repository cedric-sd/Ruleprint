import { describe, expect, it } from 'vitest';

import { sourceLabel, sourceUrl } from './links.js';

describe('sourceUrl()', () => {
  it('links to the file and line at the scanned commit', () => {
    expect(
      sourceUrl(
        { name: 'x', commit: 'abc1234', repository: 'https://github.com/o/r' },
        { file: 'src/shipping.ts', line: 88 },
      ),
    ).toBe('https://github.com/o/r/blob/abc1234/src/shipping.ts#L88');
  });

  it('falls back to HEAD and omits the anchor without a line', () => {
    expect(sourceUrl({ name: 'x', repository: 'https://github.com/o/r/' }, { file: 'a.ts' })).toBe(
      'https://github.com/o/r/blob/HEAD/a.ts',
    );
  });

  it('is undefined without a repository', () => {
    expect(sourceUrl({ name: 'x' }, { file: 'a.ts', line: 1 })).toBeUndefined();
  });
});

describe('sourceLabel()', () => {
  it('formats file:line', () => {
    expect(sourceLabel({ file: 'a.ts', line: 3 })).toBe('a.ts:3');
    expect(sourceLabel({ file: 'a.ts' })).toBe('a.ts');
  });
});
