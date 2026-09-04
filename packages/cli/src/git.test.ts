import { describe, expect, it } from 'vitest';

import { normalizeRepositoryUrl } from './git.js';

describe('normalizeRepositoryUrl()', () => {
  it.each([
    ['git@github.com:cedric-sd/Ruleprint.git', 'https://github.com/cedric-sd/Ruleprint'],
    ['https://github.com/cedric-sd/Ruleprint.git', 'https://github.com/cedric-sd/Ruleprint'],
    ['https://github.com/cedric-sd/Ruleprint', 'https://github.com/cedric-sd/Ruleprint'],
    ['ssh://git@github.com/cedric-sd/Ruleprint.git', 'https://github.com/cedric-sd/Ruleprint'],
    ['https://user:token@gitlab.com/group/sub/repo.git', 'https://gitlab.com/group/sub/repo'],
    ['git://github.com/owner/repo.git', 'https://github.com/owner/repo'],
    ['  https://github.com/owner/repo/  \n', 'https://github.com/owner/repo'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeRepositoryUrl(input)).toBe(expected);
  });

  it.each(['', 'not a url', '/local/path/repo.git', 'file:///tmp/repo'])(
    'returns undefined for %j',
    (input) => {
      expect(normalizeRepositoryUrl(input)).toBeUndefined();
    },
  );
});
