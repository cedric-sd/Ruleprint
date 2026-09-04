import type { Node } from '@vscode/tree-sitter-wasm';

function named(node: Node): Node[] {
  return node.namedChildren.filter((child): child is Node => child !== null);
}

function unescape(sequence: string): string {
  try {
    return JSON.parse(`"${sequence}"`) as string;
  } catch {
    return sequence.slice(1);
  }
}

/** Content of a `string` node with escapes decoded, regardless of the quote style. */
export function stringContent(node: Node): string {
  return named(node)
    .map((part) => (part.type === 'escape_sequence' ? unescape(part.text) : part.text))
    .join('');
}

/** Text of a string or template literal argument; `undefined` for anything else. */
export function literalText(node: Node): string | undefined {
  if (node.type === 'string') return stringContent(node);
  if (node.type === 'template_string') return node.text.slice(1, -1);
  return undefined;
}
