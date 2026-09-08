import type { CollectContext, Collector, RuleCandidate, SourceFile } from '@ruleprint/core';
import type { AstConfig } from '@ruleprint/spec';
import { getParser, grammarFor, normalizeNode, type Node } from '@ruleprint/tree-sitter-utils';

import { globToRegExp, matchesAny } from './glob.js';
import { evaluateCaseValue, evaluateCondition, glossaryTerms, named, unwrap } from './signals.js';
import { describeConsequence, describeTernary, humanCondition } from './title.js';

export const PACKAGE_NAME = '@ruleprint/collector-ast' as const;

const CODE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.)/;
const SNIPPET_LINES = 5;

interface Found {
  readonly node: Node;
  readonly condition: Node;
  readonly consequence: string;
  readonly line: number;
  readonly symbol: string;
  /** For `case` values: the discriminant they are compared with. */
  readonly discriminant?: Node;
  readonly conditionText?: string;
}

function functionName(node: Node): string | undefined {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text;
  }
  if (node.type === 'arrow_function' || node.type === 'function_expression') {
    const own = node.childForFieldName('name')?.text;
    if (own) return own;
    const parent = node.parent;
    if (parent?.type === 'variable_declarator') return parent.childForFieldName('name')?.text;
    if (parent?.type === 'assignment_expression') return parent.childForFieldName('left')?.text;
    if (parent?.type === 'pair') return parent.childForFieldName('key')?.text;
  }
  return undefined;
}

function snippet(node: Node): string {
  return node.text.split('\n').slice(0, SNIPPET_LINES).join('\n');
}

/**
 * Infers rules from conditionals with a domain signal (ADR-0007). Opt-in: only files matching
 * `include` (minus `exclude` and test files) are analysed.
 */
export function createAstCollector(config: AstConfig): Collector {
  const include = config.include.map(globToRegExp);
  const exclude = (config.exclude ?? []).map(globToRegExp);
  const glossary = config.glossary ?? [];

  function walk(node: Node, symbol: string | undefined, out: Found[]): void {
    if (node.type === 'catch_clause') return;
    const name = functionName(node);
    const scope = name ?? symbol;

    if (scope !== undefined) {
      if (node.type === 'if_statement') {
        const condition = node.childForFieldName('condition');
        if (condition) {
          out.push({
            node,
            condition,
            consequence: describeConsequence(node.childForFieldName('consequence')),
            line: node.startPosition.row + 1,
            symbol: scope,
          });
        }
      } else if (node.type === 'ternary_expression') {
        const condition = node.childForFieldName('condition');
        if (condition) {
          out.push({
            node,
            condition,
            consequence: describeTernary(
              node.childForFieldName('consequence'),
              node.childForFieldName('alternative'),
            ),
            line: node.startPosition.row + 1,
            symbol: scope,
          });
        }
      } else if (node.type === 'switch_statement') {
        const discriminant = node.childForFieldName('value');
        const body = node.childForFieldName('body');
        for (const switchCase of body ? named(body) : []) {
          if (switchCase.type !== 'switch_case') continue;
          const value = switchCase.childForFieldName('value');
          if (!value || !discriminant) continue;
          const statements = named(switchCase).filter(
            (c) => c.id !== value.id && c.type !== 'break_statement',
          );
          out.push({
            node: switchCase,
            condition: value,
            consequence: describeConsequence(statements[0] ?? null),
            line: switchCase.startPosition.row + 1,
            symbol: scope,
            discriminant,
            conditionText: `${humanCondition(discriminant)} is ${humanCondition(value)}`,
          });
        }
      }
    }
    for (const child of named(node)) walk(child, scope, out);
  }

  return {
    name: 'ast',

    match(path: string): boolean {
      if (!CODE_FILE.test(path) || TEST_FILE.test(path)) return false;
      return matchesAny(path, include) && !matchesAny(path, exclude);
    },

    async collect(file: SourceFile, ctx: CollectContext): Promise<RuleCandidate[]> {
      const parser = await getParser(grammarFor(file.path));
      const tree = parser.parse(file.content);
      if (!tree) {
        ctx.warn(`${file.path}: could not be parsed`);
        return [];
      }
      if (tree.rootNode.hasError) {
        ctx.warn(`${file.path}: syntax error; collected what could be parsed`);
      }
      const found: Found[] = [];
      walk(tree.rootNode, undefined, found);

      const candidates: RuleCandidate[] = [];
      for (const item of found) {
        const evaluation = item.discriminant
          ? evaluateCaseValue(item.condition, item.discriminant, glossary)
          : evaluateCondition(unwrap(item.condition), glossary);
        if (!evaluation.keep) continue;
        const tags = [
          ...new Set([...evaluation.tags, ...glossaryTerms(item.symbol, glossary)]),
        ].sort();
        const condition = item.conditionText ?? humanCondition(item.condition);
        candidates.push({
          title: `${item.symbol}: when ${condition}, ${item.consequence}`,
          description: snippet(item.node),
          ...(tags.length > 0 && { tags }),
          normalized: normalizeNode(item.node),
          origin: {
            collector: 'ast',
            confidence: 'inferred',
            sources: [{ file: file.path, line: item.line, symbol: item.symbol, kind: 'code' }],
          },
        });
      }
      return candidates;
    },
  };
}

export { globToRegExp } from './glob.js';
export { evaluateCondition, words } from './signals.js';
export { describeConsequence, humanCondition } from './title.js';
