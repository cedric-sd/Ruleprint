import type { Node } from '@vscode/tree-sitter-wasm';

import { stringContent } from './literals.js';

/**
 * Normalised form of a test (ADR-0005): the S-expression of the named nodes of the `it`/`test`
 * call, with the title replaced by `<title>`, comments dropped, strings by content, a bare
 * arrow parameter written like a parenthesised one, and locally declared identifiers
 * alpha-renamed in order of first appearance. Formatting and local renames leave it unchanged;
 * literals, free identifiers, property names and structure change it.
 */
export function normalizeTest(call: Node, titleNode: Node): string {
  const locals = new Set<string>();
  collectLocals(call, locals);
  const out: string[] = [];
  serialize(call, { titleNode, locals, renamed: new Map() }, out);
  return out.join(' ');
}

interface Context {
  readonly titleNode: Node;
  readonly locals: Set<string>;
  readonly renamed: Map<string, string>;
}

const IDENTIFIER_TYPES = new Set([
  'identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
]);

function named(node: Node): Node[] {
  return node.namedChildren.filter((child): child is Node => child !== null);
}

function collectPattern(node: Node | null, locals: Set<string>): void {
  if (!node) return;
  if (node.type === 'identifier' || node.type === 'shorthand_property_identifier_pattern') {
    locals.add(node.text);
    return;
  }
  if (node.type === 'pair_pattern') {
    collectPattern(node.childForFieldName('value'), locals);
    return;
  }
  if (node.type === 'assignment_pattern') {
    collectPattern(node.childForFieldName('left'), locals);
    return;
  }
  if (
    node.type === 'object_pattern' ||
    node.type === 'array_pattern' ||
    node.type === 'rest_pattern' ||
    node.type === 'required_parameter' ||
    node.type === 'optional_parameter'
  ) {
    const pattern = node.childForFieldName('pattern');
    if (pattern) {
      collectPattern(pattern, locals);
      return;
    }
    for (const child of named(node)) collectPattern(child, locals);
  }
}

/** Every identifier bound inside the test: parameters, declarations, patterns, catch, loops. */
function collectLocals(node: Node, locals: Set<string>): void {
  switch (node.type) {
    case 'variable_declarator':
    case 'function_declaration':
    case 'class_declaration':
      collectPattern(node.childForFieldName('name'), locals);
      break;
    case 'required_parameter':
    case 'optional_parameter':
      collectPattern(node.childForFieldName('pattern'), locals);
      break;
    case 'arrow_function':
    case 'catch_clause':
      collectPattern(node.childForFieldName('parameter'), locals);
      break;
    case 'for_in_statement':
      collectPattern(node.childForFieldName('left'), locals);
      break;
    default:
      break;
  }
  for (const child of named(node)) collectLocals(child, locals);
}

function identifierToken(node: Node, ctx: Context): string {
  const name = node.text;
  if (!ctx.locals.has(name)) return `${node.type}:${name}`;
  let alias = ctx.renamed.get(name);
  if (alias === undefined) {
    alias = `$${ctx.renamed.size}`;
    ctx.renamed.set(name, alias);
  }
  return `${node.type}:${alias}`;
}

function serialize(node: Node, ctx: Context, out: string[]): void {
  if (node.type === 'comment') return;
  if (node.id === ctx.titleNode.id) {
    out.push('<title>');
    return;
  }
  if (node.type === 'string') {
    out.push(`string:${JSON.stringify(stringContent(node))}`);
    return;
  }
  if (IDENTIFIER_TYPES.has(node.type)) {
    out.push(identifierToken(node, ctx));
    return;
  }
  if (node.namedChildCount === 0) {
    out.push(`${node.type}:${node.text}`);
    return;
  }

  out.push(`(${node.type}`);
  if (node.type === 'arrow_function') {
    // `a => x` and `(a) => x` are the same function.
    const bare = node.childForFieldName('parameter');
    if (bare) {
      out.push('(formal_parameters', '(required_parameter');
      serialize(bare, ctx, out);
      out.push(')', ')');
      for (const child of named(node)) {
        if (child.id !== bare.id) serialize(child, ctx, out);
      }
      out.push(')');
      return;
    }
  }
  for (const child of named(node)) serialize(child, ctx, out);
  out.push(')');
}
