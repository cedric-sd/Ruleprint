import type { Node } from '@ruleprint/tree-sitter-utils';
import { stringContent } from '@ruleprint/tree-sitter-utils';

const COMPARISON = new Set(['<', '<=', '>', '>=', '===', '!==', '==', '!=']);
const LOGICAL = new Set(['&&', '||', '??']);
const SIZE_PROPERTIES = new Set(['length', 'size', 'count']);
const NOISE_CALLS = new Set([
  'Array.isArray',
  'Number.isNaN',
  'isNaN',
  'Number.isFinite',
  'isFinite',
]);
const SCREAMING = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[A-Z]{2,}[A-Z0-9]*$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const IDENTIFIER_TYPES = new Set([
  'identifier',
  'property_identifier',
  'shorthand_property_identifier',
  'private_property_identifier',
]);

export function named(node: Node): Node[] {
  return node.namedChildren.filter((child): child is Node => child !== null);
}

export function unwrap(node: Node): Node {
  let current = node;
  while (current.type === 'parenthesized_expression') {
    const [inner] = named(current);
    if (!inner) break;
    current = inner;
  }
  return current;
}

/** camelCase, PascalCase, snake_case and digits → lower-case words. */
export function words(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w !== '')
    .map((w) => w.toLowerCase());
}

export function isScreaming(name: string): boolean {
  return SCREAMING.test(name);
}

function isTrivialLiteral(node: Node): boolean {
  switch (node.type) {
    case 'number':
      return ['0', '1'].includes(node.text);
    case 'unary_expression':
      return (
        node.childForFieldName('operator')?.text === '-' && isTrivialLiteral(named(node)[0] as Node)
      );
    case 'string':
      return stringContent(node).trim() === '';
    case 'template_string':
      return node.text.length <= 2;
    case 'null':
    case 'undefined':
    case 'true':
    case 'false':
      return true;
    default:
      return false;
  }
}

function isLiteral(node: Node): boolean {
  return (
    ['number', 'string', 'template_string', 'null', 'undefined', 'true', 'false'].includes(
      node.type,
    ) ||
    (node.type === 'unary_expression' && node.childForFieldName('operator')?.text === '-')
  );
}

function isSizeAccess(node: Node): boolean {
  const inner = unwrap(node);
  return (
    inner.type === 'member_expression' &&
    SIZE_PROPERTIES.has(inner.childForFieldName('property')?.text ?? '')
  );
}

function isNullish(node: Node): boolean {
  const inner = unwrap(node);
  return inner.type === 'null' || inner.type === 'undefined';
}

function isBareReference(node: Node): boolean {
  const inner = unwrap(node);
  return inner.type === 'identifier' || inner.type === 'member_expression' || inner.type === 'this';
}

/** Glossary terms found in an identifier, as lower-case tags. */
export function glossaryTerms(identifier: string, glossary: readonly string[]): string[] {
  if (glossary.length === 0) return [];
  const phrase = words(identifier).join(' ');
  return glossary
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term !== '' && phrase.includes(term));
}

function enumLike(node: Node): boolean {
  if (node.type !== 'member_expression') return false;
  const object = node.childForFieldName('object');
  const property = node.childForFieldName('property');
  if (!object || !property) return false;
  return (
    object.type === 'identifier' &&
    PASCAL.test(object.text) &&
    (PASCAL.test(property.text) || isScreaming(property.text))
  );
}

const PREDICATE_PREFIXES = new Set([
  'is',
  'has',
  'can',
  'should',
  'must',
  'requires',
  'needs',
  'allows',
  'allow',
  'was',
  'are',
  'does',
  'did',
  'will',
  'use',
  'uses',
]);
const PREDICATE_WORDS = new Set([
  'active',
  'valid',
  'enabled',
  'disabled',
  'expired',
  'exceeded',
  'paid',
  'free',
  'ready',
  'done',
  'open',
  'closed',
]);

/** `isPaid`, `charge.disputed`, `requiresConfirmation`: a name that reads as a yes/no question. */
function isPredicateName(name: string): boolean {
  const parts = words(name);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first !== undefined && PREDICATE_PREFIXES.has(first)) return true;
  if (last === undefined) return false;
  return PREDICATE_WORDS.has(last) || /(?:ed|able|ible)$/.test(last);
}

/** The name a reference is known by: the identifier, or the last property of a member chain. */
function referenceName(node: Node): string | undefined {
  if (node.type === 'identifier') return node.text;
  if (node.type === 'member_expression') return node.childForFieldName('property')?.text;
  return undefined;
}

/**
 * Signals carried by a bare reference or a call: a constant, an enum member, or a glossary term
 * in a predicate-like name (bare references) or in the callee (calls). A bare `.length`-style
 * access is never a signal: it is a presence check.
 */
function referenceSignals(node: Node, glossary: readonly string[]): string[] {
  const inner = unwrap(node);
  const tags: string[] = [];
  let found = false;
  if (isSizeAccess(inner)) return [];
  if (inner.type === 'identifier' && isScreaming(inner.text)) found = true;
  if (enumLike(inner)) found = true;
  if (inner.type === 'member_expression') {
    const property = inner.childForFieldName('property');
    if (property && isScreaming(property.text)) found = true;
  }
  if (inner.type === 'call_expression') {
    const callee = inner.childForFieldName('function');
    for (const id of callee ? identifiersIn(callee) : []) {
      const terms = glossaryTerms(id, glossary);
      if (terms.length > 0) {
        found = true;
        tags.push(...terms);
      }
    }
  } else {
    const name = referenceName(inner);
    if (name !== undefined && isPredicateName(name)) {
      for (const id of identifiersIn(inner)) {
        const terms = glossaryTerms(id, glossary);
        if (terms.length > 0) {
          found = true;
          tags.push(...terms);
        }
      }
    }
  }
  return found ? [...new Set(tags)].concat(tags.length === 0 ? ['\0'] : []) : [];
}

function identifiersIn(node: Node): string[] {
  const out: string[] = [];
  const visit = (n: Node): void => {
    if (IDENTIFIER_TYPES.has(n.type)) out.push(n.text);
    for (const child of named(n)) visit(child);
  };
  visit(node);
  return out;
}

export interface Evaluation {
  /** Whether the condition carries a domain signal and is not noise. */
  readonly keep: boolean;
  /** Glossary terms matched in the condition. */
  readonly tags: string[];
}

function mentionsEnvironment(node: Node): boolean {
  return /\bprocess\.env\b|\bNODE_ENV\b/.test(node.text);
}

/** True when the whole condition is one of the patterns the book must never show. */
function isNoise(node: Node, glossary: readonly string[]): boolean {
  const inner = unwrap(node);
  switch (inner.type) {
    case 'binary_expression': {
      const operator = inner.childForFieldName('operator')?.text ?? '';
      const left = inner.childForFieldName('left');
      const right = inner.childForFieldName('right');
      if (!left || !right) return true;
      if (LOGICAL.has(operator)) return isNoise(left, glossary) && isNoise(right, glossary);
      if (operator === 'instanceof') return true;
      if (COMPARISON.has(operator)) {
        if (isNullish(left) || isNullish(right)) return true;
        if (
          unwrap(left).type === 'unary_expression' &&
          unwrap(left).childForFieldName('operator')?.text === 'typeof'
        )
          return true;
        if (
          unwrap(right).type === 'unary_expression' &&
          unwrap(right).childForFieldName('operator')?.text === 'typeof'
        )
          return true;
        if (
          (isSizeAccess(left) && isLiteral(right) && isTrivialLiteral(unwrap(right))) ||
          (isSizeAccess(right) && isLiteral(left) && isTrivialLiteral(unwrap(left)))
        )
          return true;
      }
      return false;
    }
    case 'unary_expression': {
      const operator = inner.childForFieldName('operator')?.text;
      const argument = named(inner)[0];
      if (!argument) return true;
      if (operator === 'typeof') return true;
      if (operator === '!') return isNoise(argument, glossary);
      return false;
    }
    case 'call_expression': {
      const callee = inner.childForFieldName('function')?.text ?? '';
      return NOISE_CALLS.has(callee);
    }
    case 'identifier':
    case 'member_expression':
    case 'this':
      return isSizeAccess(inner) || referenceSignals(inner, glossary).length === 0;
    default:
      return false;
  }
}

/** Collects domain signals anywhere in the condition (comparison literals, constants, glossary). */
function collectSignals(node: Node, glossary: readonly string[], tags: Set<string>): boolean {
  const inner = unwrap(node);
  let found = false;
  if (inner.type === 'binary_expression') {
    const operator = inner.childForFieldName('operator')?.text ?? '';
    const left = inner.childForFieldName('left');
    const right = inner.childForFieldName('right');
    if (left && right && COMPARISON.has(operator)) {
      const literalSide = [left, right].find(
        (side) => isLiteral(unwrap(side)) && !isTrivialLiteral(unwrap(side)),
      );
      const otherSide = literalSide === left ? right : left;
      if (literalSide && !isSizeAccess(otherSide) && !mentionsEnvironment(otherSide)) {
        found = true;
        for (const id of identifiersIn(unwrap(otherSide))) {
          for (const term of glossaryTerms(id, glossary)) tags.add(term);
        }
      }
    }
  }
  if (isBareReference(inner) || inner.type === 'call_expression') {
    const signals = referenceSignals(inner, glossary);
    if (signals.length > 0) {
      found = true;
      for (const tag of signals) if (tag !== '\0') tags.add(tag);
    }
  }
  for (const child of named(inner)) {
    if (collectSignals(child, glossary, tags)) found = true;
  }
  return found;
}

/** Decides whether a condition deserves a rule candidate (ADR-0007). */
export function evaluateCondition(condition: Node, glossary: readonly string[]): Evaluation {
  const tags = new Set<string>();
  if (mentionsEnvironment(condition)) return { keep: false, tags: [] };
  if (isNoise(condition, glossary)) return { keep: false, tags: [] };
  const keep = collectSignals(condition, glossary, tags);
  return { keep, tags: [...tags].sort() };
}

/** A `case` value compared to the switch discriminant: a non-trivial literal or a signal. */
export function evaluateCaseValue(
  value: Node,
  discriminant: Node,
  glossary: readonly string[],
): Evaluation {
  const inner = unwrap(value);
  const tags = new Set<string>();
  let keep = false;
  if (isLiteral(inner) && !isTrivialLiteral(inner) && !isSizeAccess(discriminant)) keep = true;
  const signals = referenceSignals(inner, glossary);
  if (signals.length > 0) {
    keep = true;
    for (const tag of signals) if (tag !== '\0') tags.add(tag);
  }
  for (const id of identifiersIn(unwrap(discriminant))) {
    for (const term of glossaryTerms(id, glossary)) tags.add(term);
  }
  return { keep, tags: [...tags].sort() };
}
