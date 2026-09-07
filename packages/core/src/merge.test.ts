import { validate } from '@ruleprint/spec';
import { describe, expect, it } from 'vitest';

import { orphansOf } from './check.js';
import type { RuleCandidate } from './collector.js';
import { fingerprintCandidate } from './fingerprint.js';
import { idForKey } from './ids.js';
import { emptyLock, type LockFile } from './lock.js';
import { reconcile } from './reconcile.js';

const project = { name: 'p' };
const generatedAt = '2026-09-07T12:00:00.000Z';

function derived(title: string, normalized: string, file = 'test/a.spec.ts'): RuleCandidate {
  return {
    title,
    normalized,
    origin: {
      collector: 'tests',
      confidence: 'derived',
      sources: [{ file, line: 3, symbol: title, kind: 'test' }],
    },
    evidence: { tests: [title] },
  };
}

function declared(
  title: string,
  options: { id?: string; description?: string; tags?: string[]; file?: string } = {},
): RuleCandidate {
  return {
    ...(options.id !== undefined && { id: options.id }),
    title,
    ...(options.description !== undefined && { description: options.description }),
    ...(options.tags !== undefined && { tags: options.tags }),
    normalized: JSON.stringify([
      title,
      options.description ?? '',
      [...(options.tags ?? [])].sort(),
    ]),
    origin: {
      collector: 'config',
      confidence: 'declared',
      sources: [{ file: options.file ?? '.ruleprint/rules/a.md', line: 1, kind: 'config' }],
    },
  };
}

function link(id: string, file: string, line: number): RuleCandidate {
  return {
    attachTo: id,
    title: `@rule ${id}`,
    origin: {
      collector: 'annotations',
      confidence: 'inferred',
      sources: [{ file, line, kind: 'annotation' }],
    },
  };
}

async function run(candidates: RuleCandidate[], lock: LockFile = emptyLock()) {
  return reconcile({ project, generatedAt, candidates, lock });
}

describe('merge with precedence', () => {
  const testCandidate = derived('shipping > frete grátis > acima de 300', 'body-frete');
  const testId = idForKey('tests', testCandidate.title);

  it('fuses a declared rule with the derived rule of the same id, declared fields winning', async () => {
    const { document, changes, notes } = await run([
      testCandidate,
      declared('Pedido acima de R$300 tem frete grátis', {
        id: testId,
        description: 'Só no Sudeste.',
        tags: ['frete'],
      }),
    ]);
    expect(notes).toEqual([]);
    expect(document.rules).toHaveLength(1);
    const [rule] = document.rules;
    expect(rule).toMatchObject({
      id: testId,
      title: 'Pedido acima de R$300 tem frete grátis',
      description: 'Só no Sudeste.',
      tags: ['frete'],
      status: 'pending',
      origin: { collector: 'config', confidence: 'declared' },
      evidence: { tests: [testCandidate.title] },
    });
    expect(rule?.origin.sources).toEqual([
      { file: '.ruleprint/rules/a.md', line: 1, kind: 'config' },
      { file: 'test/a.spec.ts', line: 3, symbol: testCandidate.title, kind: 'test' },
    ]);
    expect(changes).toEqual([
      { kind: 'added', id: testId, title: 'Pedido acima de R$300 tem frete grátis' },
    ]);
    expect(validate(document).valid).toBe(true);
  });

  it('gives a fused rule a fingerprint made of its members, so a changed test is still drift', async () => {
    const decl = declared('Frete grátis', { id: testId });
    const fused = (await run([testCandidate, decl])).document.rules[0]?.fingerprint;
    expect(fused).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fused).not.toBe(await fingerprintCandidate(testCandidate));
    expect(fused).not.toBe(await fingerprintCandidate(decl));
    const again = (await run([decl, testCandidate])).document.rules[0]?.fingerprint;
    expect(again).toBe(fused);
    const changedTest = (await run([derived(testCandidate.title, 'body-frete-2'), decl])).document
      .rules[0]?.fingerprint;
    expect(changedTest).not.toBe(fused);
  });

  it('declared without id is a new rule, and without evidence it is orphan', async () => {
    const { document } = await run([declared('Cupom expirado é recusado', { tags: ['cupom'] })]);
    expect(document.rules).toHaveLength(1);
    expect(document.rules[0]).toMatchObject({
      id: idForKey('config', 'Cupom expirado é recusado'),
      status: 'orphan',
      origin: { confidence: 'declared' },
    });
    expect(orphansOf(document).map((r) => r.id)).toEqual([document.rules[0]?.id]);
  });

  it('declared with an id nobody else produces keeps that id and is orphan', async () => {
    const { document } = await run([declared('Regra sem teste', { id: 'RP-004242' })]);
    expect(document.rules[0]).toMatchObject({ id: 'RP-004242', status: 'orphan' });
  });

  it('orphan wins over the lock-derived status but the lock still tracks the rule', async () => {
    const decl = declared('Cupom expirado é recusado');
    const first = await run([decl]);
    const id = first.document.rules[0]?.id ?? '';
    const lock: LockFile = {
      lockVersion: 1,
      rules: {
        [id]: {
          title: decl.title,
          collector: 'config',
          fingerprint: first.document.rules[0]?.fingerprint ?? '',
          approvedAt: generatedAt,
        },
      },
    };
    const second = await run([decl], lock);
    expect(second.changes).toEqual([]);
    expect(second.document.rules[0]).toMatchObject({ status: 'orphan', approvedAt: generatedAt });
  });

  it('@rule links add an annotation source and are not rules', async () => {
    const { document, notes } = await run([testCandidate, link(testId, 'src/shipping.ts', 12)]);
    expect(document.rules).toHaveLength(1);
    expect(document.rules[0]?.origin.sources).toEqual([
      { file: 'test/a.spec.ts', line: 3, symbol: testCandidate.title, kind: 'test' },
      { file: 'src/shipping.ts', line: 12, kind: 'annotation' },
    ]);
    expect(notes).toEqual([]);
  });

  it('an annotation gives a declared rule evidence, so it is not orphan', async () => {
    const decl = declared('Cupom expirado é recusado');
    const id = idForKey('config', decl.title);
    const { document } = await run([decl, link(id, 'src/coupon.ts', 4)]);
    expect(document.rules[0]?.status).toBe('pending');
  });

  it('@rule to an unknown id is a note, not a rule and not an error', async () => {
    const { document, notes } = await run([testCandidate, link('RP-999999', 'src/x.ts', 1)]);
    expect(document.rules).toHaveLength(1);
    expect(notes).toEqual(['unknown @rule RP-999999 in src/x.ts:1']);
  });

  it('a hash id never collides with an explicitly declared id', async () => {
    const other = derived('other rule', 'body-other');
    const taken = idForKey('tests', other.title);
    const { document } = await run([other, declared('Declarada', { id: taken })]);
    const ids = document.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    expect(document.rules.find((r) => r.title === 'Declarada')?.id).toBe(taken);
    expect(document.rules.find((r) => r.title === 'other rule')?.id).not.toBe(taken);
  });

  it('two declared files with the same id: the first wins the text, both are sources', async () => {
    const { document } = await run([
      declared('Segunda', { id: 'RP-004242', file: '.ruleprint/rules/b.md' }),
      declared('Primeira', { id: 'RP-004242', file: '.ruleprint/rules/a.md' }),
    ]);
    expect(document.rules).toHaveLength(1);
    expect(document.rules[0]?.title).toBe('Primeira');
    expect(document.rules[0]?.origin.sources.map((s) => s.file)).toEqual([
      '.ruleprint/rules/a.md',
      '.ruleprint/rules/b.md',
    ]);
  });
});
