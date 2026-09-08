import { normalizeNode, type Node } from '@ruleprint/tree-sitter-utils';

/**
 * Normalised form of a test (ADR-0005): the S-expression of the `it`/`test` call with the title
 * replaced by `<title>`. See `normalizeNode` for the rules.
 */
export function normalizeTest(call: Node, titleNode: Node): string {
  return normalizeNode(call, { replace: titleNode, placeholder: '<title>' });
}
