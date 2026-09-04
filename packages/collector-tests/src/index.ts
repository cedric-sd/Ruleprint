import type { CollectContext, Collector, RuleCandidate, SourceFile } from '@ruleprint/core';

import { extractTestCases } from './extract.js';
import { getParser, grammarFor } from './parser.js';

export const PACKAGE_NAME = '@ruleprint/collector-tests' as const;

export const TITLE_SEPARATOR = ' > ';

const TEST_FILE = /(?:^|\/)(?:__tests__\/[^/]+|[^/]+\.(?:test|spec))\.[cm]?[jt]sx?$/;

/**
 * Derives one rule per `it`/`test` in vitest/jest-style files. The title is the chain of
 * enclosing `describe` titles plus the test title, joined by {@link TITLE_SEPARATOR}.
 */
export const testsCollector: Collector = {
  name: 'tests',

  match(path: string): boolean {
    return TEST_FILE.test(path);
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

    return extractTestCases(tree.rootNode).map((testCase) => {
      const title = testCase.titlePath.join(TITLE_SEPARATOR);
      const leaf = testCase.titlePath[testCase.titlePath.length - 1] ?? title;
      return {
        title,
        normalized: testCase.normalized,
        origin: {
          collector: 'tests',
          confidence: 'derived',
          sources: [{ file: file.path, line: testCase.line, symbol: leaf, kind: 'test' }],
        },
        evidence: { tests: [title] },
      };
    });
  },
};

export type { TestCase } from './extract.js';
