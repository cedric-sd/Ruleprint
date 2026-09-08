import { PR_COMMENT_MARKER } from '@ruleprint/core';
import { describe, expect, it } from 'vitest';

import { decidePrAction } from './pr-event.js';

function pullRequest(action: string, headRepo: string | null = 'o/r'): unknown {
  return {
    action,
    number: 7,
    pull_request: {
      number: 7,
      head: {
        ref: 'feature',
        sha: 'abc1234def5678',
        repo: headRepo === null ? null : { full_name: headRepo },
      },
    },
    repository: { full_name: 'o/r' },
  };
}

function issueComment(
  body: string,
  overrides: {
    action?: string;
    onPull?: boolean;
    sender?: { login: string; type: string };
  } = {},
): unknown {
  return {
    action: overrides.action ?? 'edited',
    issue: { number: 7, ...(overrides.onPull === false ? {} : { pull_request: { url: 'x' } }) },
    comment: { id: 42, body },
    sender: overrides.sender ?? { login: 'maria', type: 'User' },
  };
}

const ticked = `${PR_COMMENT_MARKER}\n- [ ] **Approve all** (2 changes)\n- [x] **RP-000001** a\n- [ ] **RP-000002** b`;

describe('decidePrAction()', () => {
  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])(
    'reports on pull_request %s',
    (action) => {
      expect(decidePrAction('pull_request', pullRequest(action))).toEqual({
        kind: 'report',
        number: 7,
        headSha: 'abc1234def5678',
        headRef: 'feature',
        fork: false,
      });
    },
  );

  it('flags a fork when the head repository differs or is gone', () => {
    expect(decidePrAction('pull_request', pullRequest('opened', 'x/r'))).toMatchObject({
      kind: 'report',
      fork: true,
    });
    expect(decidePrAction('pull_request', pullRequest('opened', null))).toMatchObject({
      kind: 'report',
      fork: true,
    });
  });

  it.each(['closed', 'labeled', 'edited'])('skips pull_request %s', (action) => {
    expect(decidePrAction('pull_request', pullRequest(action))).toMatchObject({ kind: 'skip' });
  });

  it('approves the ticked ids of an edited bot comment', () => {
    expect(decidePrAction('issue_comment', issueComment(ticked))).toEqual({
      kind: 'approve',
      number: 7,
      commentId: 42,
      all: false,
      ids: ['RP-000001'],
      login: 'maria',
    });
  });

  it('approves everything when the approve-all box is ticked', () => {
    const body = ticked.replace('- [ ] **Approve all**', '- [x] **Approve all**');
    expect(decidePrAction('issue_comment', issueComment(body))).toMatchObject({
      kind: 'approve',
      all: true,
      ids: ['RP-000001'],
    });
  });

  it.each<[string, unknown]>([
    ['a comment without the marker', issueComment('- [x] **RP-000001** a')],
    ['a comment on a plain issue', issueComment(ticked, { onPull: false })],
    ['an edit by a bot account', issueComment(ticked, { sender: { login: 'x', type: 'Bot' } })],
    [
      'an edit by a [bot] login',
      issueComment(ticked, { sender: { login: 'github-actions[bot]', type: 'User' } }),
    ],
    ['nothing ticked', issueComment(ticked.replace('[x]', '[ ]'))],
    ['a created comment', issueComment(ticked, { action: 'created' })],
    ['a malformed payload', { action: 'edited' }],
    ['a payload that is not an object', 'nope'],
  ])('skips %s', (_label, payload) => {
    expect(decidePrAction('issue_comment', payload)).toMatchObject({ kind: 'skip' });
  });

  it('skips unknown events with the reason', () => {
    expect(decidePrAction('push', {})).toEqual({
      kind: 'skip',
      reason: 'event push is not handled',
    });
  });
});
