import type { Node } from '@ruleprint/tree-sitter-utils';
import { stringContent } from '@ruleprint/tree-sitter-utils';

import { named, unwrap } from './signals.js';

const MAX_PART = 80;

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clip(text: string): string {
  const s = squash(text);
  return s.length > MAX_PART ? `${s.slice(0, MAX_PART - 1)}…` : s;
}

/** Quotes off string literals so titles read as prose. */
function unquote(text: string): string {
  return text.replace(
    /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g,
    (_m, a: string | undefined, b: string | undefined) => (a ?? b ?? '').replace(/\\(.)/g, '$1'),
  );
}

/** `a && !b || c !== D` → `a and not b or c is not D`. */
export function humanCondition(condition: Node): string {
  let text = squash(unwrap(condition).text);
  text = text.replace(/\s*!==\s*/g, ' is not ').replace(/\s*!=\s*/g, ' is not ');
  text = text.replace(/\s*===\s*/g, ' is ').replace(/\s*==\s*/g, ' is ');
  text = text.replace(/\s*&&\s*/g, ' and ').replace(/\s*\|\|\s*/g, ' or ');
  text = text.replace(/!\s*(?=[A-Za-z_$(])/g, 'not ');
  return clip(unquote(text));
}

function firstStatement(block: Node | null): Node | undefined {
  if (!block) return undefined;
  if (block.type !== 'statement_block') return block;
  return named(block).find((child) => child.type !== 'comment');
}

function describeThrow(statement: Node): string {
  const argument = named(statement)[0];
  if (!argument) return 'throws';
  const inner = unwrap(argument);
  if (inner.type === 'new_expression') {
    const ctor = inner.childForFieldName('constructor')?.text ?? 'Error';
    const args = inner.childForFieldName('arguments');
    const message = args
      ? named(args).find((a) => a.type === 'string' || a.type === 'template_string')
      : undefined;
    if (message) {
      const text = message.type === 'string' ? stringContent(message) : message.text.slice(1, -1);
      return `throws ${ctor}: ${clip(text)}`;
    }
    return `throws ${ctor}`;
  }
  return `throws ${clip(inner.text)}`;
}

function describeExpression(expression: Node): string {
  const inner = unwrap(expression);
  if (inner.type === 'await_expression') {
    const awaited = named(inner)[0];
    return awaited ? describeExpression(awaited) : 'then await';
  }
  if (inner.type === 'assignment_expression' || inner.type === 'augmented_assignment_expression') {
    return `sets ${clip(inner.childForFieldName('left')?.text ?? '')}`;
  }
  if (inner.type === 'update_expression') {
    return `sets ${clip(inner.childForFieldName('argument')?.text ?? inner.text)}`;
  }
  if (inner.type === 'call_expression') {
    return `calls ${clip(inner.childForFieldName('function')?.text ?? inner.text)}`;
  }
  return `then ${clip(inner.text)}`;
}

/** Summary of what the branch does, from its first statement. */
export function describeConsequence(block: Node | null): string {
  const statement = firstStatement(block);
  if (!statement) return 'then nothing';
  switch (statement.type) {
    case 'return_statement': {
      const value = named(statement)[0];
      return value ? `returns ${clip(unquote(value.text))}` : 'returns';
    }
    case 'throw_statement':
      return describeThrow(statement);
    case 'expression_statement': {
      const expression = named(statement)[0];
      return expression ? describeExpression(expression) : 'then nothing';
    }
    case 'lexical_declaration':
    case 'variable_declaration':
      return `sets ${clip(named(statement)[0]?.childForFieldName('name')?.text ?? statement.text)}`;
    default:
      return `then ${clip(statement.text)}`;
  }
}

export function describeTernary(consequence: Node | null, alternative: Node | null): string {
  const yes = consequence ? clip(unquote(consequence.text)) : '';
  const no = alternative ? clip(unquote(alternative.text)) : '';
  return `returns ${yes} (otherwise ${no})`;
}
