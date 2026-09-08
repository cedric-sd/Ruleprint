import { describe, expect, it } from 'vitest';

import { getParser, grammarFor, normalizeNode } from './index.js';

describe('tree-sitter-utils', () => {
  it('picks the grammar from the extension', () => {
    expect(grammarFor('a.ts')).toBe('typescript');
    expect(grammarFor('a.js')).toBe('typescript');
    expect(grammarFor('a.tsx')).toBe('tsx');
    expect(grammarFor('a.jsx')).toBe('tsx');
  });

  it('parses and normalises with a replaced node', async () => {
    const parser = await getParser('typescript');
    const tree = parser.parse("if (a > 300) { log('x'); }");
    if (!tree) throw new Error('parse failed');
    const condition = tree.rootNode.descendantsOfType('parenthesized_expression')[0];
    if (!condition) throw new Error('no condition');
    const out = normalizeNode(tree.rootNode, { replace: condition, placeholder: '<cond>' });
    expect(out).toContain('<cond>');
    expect(out).not.toContain('number:300');
    expect(normalizeNode(tree.rootNode)).toContain('number:300');
  });
});
