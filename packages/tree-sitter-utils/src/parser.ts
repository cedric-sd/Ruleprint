import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import TreeSitter from '@vscode/tree-sitter-wasm';
import type { Language, Parser } from '@vscode/tree-sitter-wasm';

export type Grammar = 'typescript' | 'tsx';

const require = createRequire(import.meta.url);

let runtimeReady: Promise<void> | undefined;
const parsers = new Map<Grammar, Promise<Parser>>();

function grammarPath(grammar: Grammar): string {
  const packageDir = dirname(require.resolve('@vscode/tree-sitter-wasm/package.json'));
  return join(packageDir, 'wasm', `tree-sitter-${grammar}.wasm`);
}

async function createParser(grammar: Grammar): Promise<Parser> {
  runtimeReady ??= TreeSitter.Parser.init();
  await runtimeReady;
  const language: Language = await TreeSitter.Language.load(grammarPath(grammar));
  const parser = new TreeSitter.Parser();
  parser.setLanguage(language);
  return parser;
}

/**
 * Returns a parser for the given grammar. The WASM runtime and each grammar are loaded once,
 * on first use, and shared afterwards.
 */
export function getParser(grammar: Grammar): Promise<Parser> {
  let parser = parsers.get(grammar);
  if (!parser) {
    parser = createParser(grammar);
    parsers.set(grammar, parser);
  }
  return parser;
}

export function grammarFor(path: string): Grammar {
  return /\.[cm]?[jt]sx$/.test(path) ? 'tsx' : 'typescript';
}
