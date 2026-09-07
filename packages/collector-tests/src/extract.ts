import type { Node } from '@vscode/tree-sitter-wasm';

import { literalText } from './literals.js';
import { normalizeTest } from './normalize.js';

/** One `it`/`test` leaf, with the titles of the suites that enclose it. */
export interface TestCase {
  /** Titles from the outermost `describe` down to the test itself. */
  readonly titlePath: readonly string[];
  /** 1-based line of the `it`/`test` call. */
  readonly line: number;
  /** Normalised form of the call, the fingerprint material (see normalize.ts). */
  readonly normalized: string;
}

const SUITE_NAMES = new Set(['describe', 'suite', 'context']);
const TEST_NAMES = new Set(['it', 'test']);
/** Modifiers that keep the call a suite/test, e.g. `it.skip('...')`. */
const PROPERTY_MODIFIERS = new Set(['skip', 'only', 'concurrent', 'sequential', 'fails']);
/** Modifiers that are themselves called before the title, e.g. `it.each([...])('...')`. */
const CALL_MODIFIERS = new Set(['each', 'for', 'runIf', 'skipIf']);
/** `it.todo('...')` has no body: nothing to derive. */
const IGNORED_MODIFIERS = new Set(['todo']);

type CallKind = 'suite' | 'test';

interface ClassifiedCall {
  readonly kind: CallKind;
  readonly title: string;
  readonly titleNode: Node;
  readonly line: number;
  readonly args: Node;
}

function named(node: Node): Node[] {
  return node.namedChildren.filter((child): child is Node => child !== null);
}

/** `it` → { name: 'it' }, `it.skip` → { name: 'it', modifier: 'skip' }, `logger.it` → undefined. */
function calleeParts(fn: Node): { name: string; modifier?: string } | undefined {
  if (fn.type === 'identifier') {
    return { name: fn.text };
  }
  if (fn.type === 'member_expression') {
    const object = fn.childForFieldName('object');
    const property = fn.childForFieldName('property');
    if (object?.type === 'identifier' && property?.type === 'property_identifier') {
      return { name: object.text, modifier: property.text };
    }
  }
  return undefined;
}

function classify(call: Node): ClassifiedCall | undefined {
  const fn = call.childForFieldName('function');
  const args = call.childForFieldName('arguments');
  if (!fn || !args || args.type !== 'arguments') {
    return undefined;
  }

  let parts: { name: string; modifier?: string } | undefined;
  if (fn.type === 'call_expression') {
    // `it.each([...])('title', fn)`: the callee is itself a call whose callee is `it.each`.
    const inner = fn.childForFieldName('function');
    const innerParts = inner ? calleeParts(inner) : undefined;
    if (innerParts?.modifier !== undefined && CALL_MODIFIERS.has(innerParts.modifier)) {
      parts = innerParts;
    }
  } else {
    parts = calleeParts(fn);
  }
  if (!parts) {
    return undefined;
  }

  const kind: CallKind | undefined = SUITE_NAMES.has(parts.name)
    ? 'suite'
    : TEST_NAMES.has(parts.name)
      ? 'test'
      : undefined;
  if (!kind) {
    return undefined;
  }
  if (parts.modifier !== undefined) {
    if (IGNORED_MODIFIERS.has(parts.modifier)) {
      return undefined;
    }
    if (!PROPERTY_MODIFIERS.has(parts.modifier) && !CALL_MODIFIERS.has(parts.modifier)) {
      return undefined;
    }
  }

  const [first] = named(args);
  const title = first ? literalText(first) : undefined;
  if (!first || title === undefined || title.trim() === '') {
    return undefined;
  }
  return { kind, title, titleNode: first, line: call.startPosition.row + 1, args };
}

function callbackBodies(args: Node): Node[] {
  return named(args)
    .filter((arg) => arg.type === 'arrow_function' || arg.type === 'function_expression')
    .map((fn) => fn.childForFieldName('body'))
    .filter((body): body is Node => body !== null);
}

function visit(node: Node, path: readonly string[], out: TestCase[]): void {
  if (node.type === 'call_expression') {
    const call = classify(node);
    if (call?.kind === 'test') {
      out.push({
        titlePath: [...path, call.title],
        line: call.line,
        normalized: normalizeTest(node, call.titleNode),
      });
      return;
    }
    if (call?.kind === 'suite') {
      for (const body of callbackBodies(call.args)) {
        visit(body, [...path, call.title], out);
      }
      return;
    }
  }
  for (const child of named(node)) {
    visit(child, path, out);
  }
}

/** Walks a parsed test file and returns every test leaf in source order. */
export function extractTestCases(root: Node): TestCase[] {
  const out: TestCase[] = [];
  visit(root, [], out);
  return out;
}
