import { describe, expect, it } from 'vitest';

import {
  parseApprovals,
  PR_COMMENT_MARKER,
  renderPrComment,
  type PrCommentInput,
} from './pr-comment.js';
import type { Change } from './reconcile.js';

const changes: Change[] = [
  {
    kind: 'added',
    id: 'RP-000123',
    title: 'order validation > rejects an order above the maximum',
  },
  { kind: 'added', id: 'RP-000456', title: 'refund > disputed charge cannot be refunded' },
  { kind: 'changed', id: 'RP-088272', title: 'Pedido acima de R$300 tem frete grátis no Sudeste' },
  {
    kind: 'renamed',
    id: 'RP-018388',
    title: 'shipping > frete grátis > só vale no Sudeste',
    previousTitle: 'shipping > frete grátis > não vale fora do Sudeste',
  },
  {
    kind: 'removed',
    id: 'RP-064421',
    title: 'order validation > rejects an order below the minimum',
  },
];

const orphans = [{ id: 'RP-000999', title: 'Cupom expirado é recusado no checkout' }];

const sources = {
  'RP-000123': { file: 'test/order.spec.ts', line: 12 },
  'RP-000456': { file: 'test/refund.spec.ts', line: 30 },
  'RP-088272': { file: '.ruleprint/rules/frete-sudeste.md', line: 1 },
  'RP-018388': { file: 'test/shipping.spec.ts', line: 40 },
  'RP-000999': { file: '.ruleprint/rules/cupom-expirado.md' },
};

const full: PrCommentInput = {
  changes,
  orphans,
  approved: 20,
  sources,
  blobUrl: 'https://github.com/o/r/blob/abc',
  canApprove: true,
  directory: 'examples/fixture-express-api',
  note: 'Approved RP-000123, RP-000456 (commit abc1234).',
  version: '0.1.0',
  commit: 'abc1234def',
};

describe('renderPrComment()', () => {
  it('renders the whole comment', () => {
    expect(renderPrComment(full)).toMatchInlineSnapshot(`
      "<!-- ruleprint -->

      ## RulePrint

      **5 changes need approval** · 20 approved · 1 orphan · in \`examples/fixture-express-api\`

      > Approved RP-000123, RP-000456 (commit abc1234).

      Tick a box to approve; the bot commits \`ruleprint.lock\` to this branch.

      - [ ] **Approve all** (5 changes)

      ### New rules (2)

      - [ ] **RP-000123** order validation > rejects an order above the maximum ([test/order.spec.ts:12](https://github.com/o/r/blob/abc/test/order.spec.ts#L12))
      - [ ] **RP-000456** refund > disputed charge cannot be refunded ([test/refund.spec.ts:30](https://github.com/o/r/blob/abc/test/refund.spec.ts#L30))

      ### Changed rules (1)

      - [ ] **RP-088272** Pedido acima de R$300 tem frete grátis no Sudeste ([.ruleprint/rules/frete-sudeste.md:1](https://github.com/o/r/blob/abc/.ruleprint/rules/frete-sudeste.md#L1))

      ### Renamed rules (1)

      - [ ] **RP-018388** ~~shipping > frete grátis > não vale fora do Sudeste~~ → shipping > frete grátis > só vale no Sudeste ([test/shipping.spec.ts:40](https://github.com/o/r/blob/abc/test/shipping.spec.ts#L40))

      ### Removed rules (1)

      Approving removes the rule from \`ruleprint.lock\`.

      - [ ] **RP-064421** order validation > rejects an order below the minimum

      ### Orphans (1)

      Declared rules without evidence. Never blocking; link code with \`@rule RP-…\` or delete the declaration.

      - **RP-000999** Cupom expirado é recusado no checkout ([.ruleprint/rules/cupom-expirado.md](https://github.com/o/r/blob/abc/.ruleprint/rules/cupom-expirado.md))

      <sub>ruleprint 0.1.0 · scanned abc1234 · \`npx ruleprint check\` reproduces this locally.</sub>
      "
    `);
  });

  it('starts with the marker and ends with a newline', () => {
    const body = renderPrComment(full);
    expect(body.startsWith(`${PR_COMMENT_MARKER}\n`)).toBe(true);
    expect(body.endsWith('\n')).toBe(true);
    expect(body.endsWith('\n\n')).toBe(false);
  });

  it('omits empty sections and keeps the order added → changed → renamed → removed → orphans', () => {
    const body = renderPrComment({
      changes: [changes[4] as Change, changes[0] as Change],
      orphans: [],
      approved: 3,
      canApprove: true,
    });
    const headings = body.split('\n').filter((line) => line.startsWith('### '));
    expect(headings).toEqual(['### New rules (1)', '### Removed rules (1)']);
    expect(body).not.toContain('Orphans');
  });

  it('shows links only with a blob URL, plain locations otherwise, nothing without a source', () => {
    const plain = renderPrComment({ ...full, blobUrl: undefined });
    expect(plain).toContain(
      '- [ ] **RP-000123** order validation > rejects an order above the maximum (`test/order.spec.ts:12`)',
    );
    expect(plain).toContain(
      '- **RP-000999** Cupom expirado é recusado no checkout (`.ruleprint/rules/cupom-expirado.md`)',
    );
    expect(plain).toContain(
      '- [ ] **RP-064421** order validation > rejects an order below the minimum\n',
    );
  });

  it('caps the list and tells how many are hidden', () => {
    const body = renderPrComment({ ...full, limit: 2 });
    expect(body).toContain('- [ ] **RP-000123**');
    expect(body).toContain('- [ ] **RP-000456**');
    expect(body).not.toContain('RP-088272');
    expect(body).toContain('_…and 3 more. Run `npx ruleprint check` locally to see everything._');
    expect(body).toContain('- [ ] **Approve all** (5 changes)');
    expect(body).toContain('### Orphans (1)');
  });

  it('drops the checkboxes and explains why on a fork', () => {
    const body = renderPrComment({ ...full, canApprove: false });
    expect(body).not.toContain('[ ]');
    expect(body).toContain(
      'Checkbox approval works only for branches of this repository. Run `npx ruleprint approve` locally and push `ruleprint.lock`.',
    );
    expect(body).toContain('- **RP-000123** order validation');
  });

  it('says so when everything is approved', () => {
    expect(renderPrComment({ changes: [], orphans: [], approved: 20, canApprove: true }))
      .toMatchInlineSnapshot(`
      "<!-- ruleprint -->

      ## RulePrint

      ✔ All 20 rules approved. Nothing to review.

      <sub>\`npx ruleprint check\` reproduces this locally.</sub>
      "
    `);
  });

  it('keeps listing orphans when nothing needs approval', () => {
    const body = renderPrComment({ changes: [], orphans, approved: 20, canApprove: true });
    expect(body).toContain('✔ All 20 rules approved. Nothing to review.');
    expect(body).toContain('### Orphans (1)');
    expect(body).not.toContain('Approve all');
  });

  it('shows the directory only when it is not the root and the note only when given', () => {
    const root = renderPrComment({ ...full, directory: '.', note: undefined });
    expect(root).not.toContain(' · in ');
    expect(root.split('\n').some((line) => line.startsWith('> '))).toBe(false);
    const none = renderPrComment({ ...full, directory: undefined });
    expect(none).not.toContain(' · in ');
  });

  it('singularises the counts', () => {
    const body = renderPrComment({
      changes: [changes[0] as Change],
      orphans: [],
      approved: 1,
      canApprove: true,
    });
    expect(body).toContain('**1 change needs approval** · 1 approved');
    expect(body).toContain('- [ ] **Approve all** (1 change)');
    expect(renderPrComment({ changes: [], orphans: [], approved: 1, canApprove: true })).toContain(
      '✔ All 1 rule approved.',
    );
  });
});

describe('parseApprovals()', () => {
  it('returns nothing for a body without the marker', () => {
    expect(parseApprovals('- [x] **RP-000123** hello')).toEqual({ all: false, ids: [] });
  });

  it('reads ticked ids, in order, once each', () => {
    const body = [
      PR_COMMENT_MARKER,
      '- [ ] **Approve all** (4 changes)',
      '- [x] **RP-000123** a',
      '  * [X] **RP-000456** b',
      '- [ ] **RP-088272** c',
      '- [x] **RP-000123** again',
      '- [x] RP-064421 not bold, ignored',
      '- **RP-000999** orphan, no box',
    ].join('\n');
    expect(parseApprovals(body)).toEqual({ all: false, ids: ['RP-000123', 'RP-000456'] });
  });

  it('reports approve all', () => {
    const body = `${PR_COMMENT_MARKER}\n- [x] **Approve all** (2 changes)\n- [ ] **RP-000123** a`;
    expect(parseApprovals(body)).toEqual({ all: true, ids: [] });
  });

  it('ignores lines inside code fences', () => {
    const body = [
      PR_COMMENT_MARKER,
      '```',
      '- [x] **RP-000123** quoted',
      '- [x] **Approve all**',
      '```',
      '- [x] **RP-000456** real',
    ].join('\n');
    expect(parseApprovals(body)).toEqual({ all: false, ids: ['RP-000456'] });
  });

  it('round-trips a rendered comment', () => {
    const ticked = renderPrComment(full)
      .replace('- [ ] **RP-000456**', '- [x] **RP-000456**')
      .replace('- [ ] **RP-064421**', '- [X] **RP-064421**');
    expect(parseApprovals(ticked)).toEqual({ all: false, ids: ['RP-000456', 'RP-064421'] });
    expect(parseApprovals(renderPrComment(full))).toEqual({ all: false, ids: [] });
  });
});
