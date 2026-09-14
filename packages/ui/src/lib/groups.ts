import type { Rule } from '@ruleprint/spec';

/** Name shown for the rules that carry no `group`. */
export const UNGROUPED = 'Ungrouped';

export interface RuleGroupView {
  readonly name: string;
  readonly rules: readonly Rule[];
  /** Rules that still need attention: anything not `approved`. */
  readonly pending: number;
}

/**
 * Groups rules by the exact text of their `group` (ADR-0009), alphabetically, with the
 * ungrouped rules last. The order of the rules inside a group is the order given.
 */
export function groupRules(rules: readonly Rule[]): RuleGroupView[] {
  const byName = new Map<string, Rule[]>();
  const ungrouped: Rule[] = [];
  for (const rule of rules) {
    if (rule.group === undefined) {
      ungrouped.push(rule);
      continue;
    }
    const list = byName.get(rule.group);
    if (list) list.push(rule);
    else byName.set(rule.group, [rule]);
  }
  const view = (name: string, members: Rule[]): RuleGroupView => ({
    name,
    rules: members,
    pending: members.filter((rule) => rule.status !== 'approved').length,
  });
  const groups = [...byName]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, members]) => view(name, members));
  if (ungrouped.length > 0) groups.push(view(UNGROUPED, ungrouped));
  return groups;
}

/** The title without its `<group> > ` (tests) or `<group>: ` (ast) prefix, for the group list. */
export function displayTitle(rule: Rule): string {
  if (rule.group === undefined) return rule.title;
  for (const separator of [' > ', ': ']) {
    const prefix = `${rule.group}${separator}`;
    if (!rule.title.startsWith(prefix)) continue;
    const rest = rule.title.slice(prefix.length);
    return rest.trim() === '' ? rule.title : rest;
  }
  return rule.title;
}
