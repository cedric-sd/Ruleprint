export type { Language, Node, Parser, Tree } from '@vscode/tree-sitter-wasm';
export { literalText, stringContent } from './literals.js';
export { normalizeNode, type NormalizeOptions } from './normalize.js';
export { getParser, grammarFor, type Grammar } from './parser.js';
