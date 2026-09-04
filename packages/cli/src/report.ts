import { summarizeChanges, type Change } from '@ruleprint/core';
import type { RulePrintDocument } from '@ruleprint/spec';

const MARK: Record<Change['kind'], string> = {
  added: '+',
  changed: '~',
  renamed: '»',
  removed: '-',
};

export function describeChange(change: Change): string {
  const title =
    change.kind === 'renamed' && change.previousTitle !== undefined
      ? `${change.previousTitle} → ${change.title}`
      : change.title;
  return `${MARK[change.kind]} ${change.id}  ${change.kind.padEnd(7)}  ${title}`;
}

export function countApproved(document: RulePrintDocument): number {
  return document.rules.filter((rule) => rule.status === 'approved').length;
}

/** One line: `12 approved · 2 added · 1 changed`. */
export function summaryLine(document: RulePrintDocument, changes: readonly Change[]): string {
  const summary = summarizeChanges(changes);
  const parts = [`${countApproved(document)} approved`];
  for (const kind of ['added', 'changed', 'renamed', 'removed'] as const) {
    if (summary[kind] > 0) parts.push(`${summary[kind]} ${kind}`);
  }
  return parts.join(' · ');
}
