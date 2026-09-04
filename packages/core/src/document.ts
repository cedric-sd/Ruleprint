import { validate, type Project, type Rule, type RulePrintDocument } from '@ruleprint/spec';

import type { RuleCandidate } from './collector.js';
import { fingerprintCandidate } from './fingerprint.js';
import { assignIds } from './ids.js';

export interface AssembleOptions {
  readonly project: Project;
  readonly candidates: readonly RuleCandidate[];
  /** RFC 3339 timestamp; passed in so the core stays free of clocks. */
  readonly generatedAt: string;
}

function identity(candidate: RuleCandidate): string {
  return JSON.stringify([
    candidate.origin.collector,
    candidate.title,
    candidate.origin.sources.map((s) => [s.file, s.line ?? null, s.symbol ?? null, s.kind ?? null]),
  ]);
}

function sortKey(candidate: RuleCandidate): string {
  const [source] = candidate.origin.sources;
  return [
    candidate.origin.collector,
    candidate.title,
    source.file,
    String(source.line ?? 0).padStart(9, '0'),
  ].join('\0');
}

function dedupe(candidates: readonly RuleCandidate[]): RuleCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = identity(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function toRule(candidate: RuleCandidate, id: string): Promise<Rule> {
  const rule: Rule = {
    id,
    title: candidate.title,
    origin: {
      collector: candidate.origin.collector,
      confidence: candidate.origin.confidence,
      sources: [...candidate.origin.sources],
    },
    fingerprint: await fingerprintCandidate(candidate),
    status: 'pending',
  };
  if (candidate.description !== undefined) rule.description = candidate.description;
  if (candidate.tags !== undefined) rule.tags = [...candidate.tags];
  if (candidate.evidence !== undefined) rule.evidence = candidate.evidence;
  return rule;
}

/**
 * Turns collector output into a valid `ruleprint.json` document: sorts, removes exact
 * duplicates, assigns provisional ids and fingerprints (ADR-0004) and validates the result.
 * Every rule starts as `pending`; other statuses need the lock (M4).
 */
export async function assembleDocument(options: AssembleOptions): Promise<RulePrintDocument> {
  const candidates = dedupe(options.candidates).sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const ids = assignIds(candidates);
  const rules = await Promise.all(
    candidates.map((candidate, i) => toRule(candidate, ids[i] ?? '')),
  );

  const document = {
    specVersion: '0.1' as const,
    project: options.project,
    generatedAt: options.generatedAt,
    rules,
  };
  const result = validate(document);
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ');
    throw new Error(`assembled document is invalid: ${details}`);
  }
  return result.document;
}
