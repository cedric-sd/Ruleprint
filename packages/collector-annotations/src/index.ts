import type { CollectContext, Collector, RuleCandidate, SourceFile } from '@ruleprint/core';

export const PACKAGE_NAME = '@ruleprint/collector-annotations' as const;

const CODE_FILE =
  /\.(?:[cm]?[jt]sx?|py|java|kt|kts|go|rb|php|cs|rs|swift|c|h|cc|cpp|hpp|m|mm|scala|dart|exs?)$/;
const TEST_FILE = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.)/;
/** Something that starts a comment before `@rule` on the same line. */
const COMMENT_MARKER = /(?:\/\/|#|\/\*|--|<!--)|^\s*\*/;
const ANNOTATION = /@rule\b([^\n]*)/g;
const RULE_ID = /RP-\d{4,}/g;

/**
 * `@rule RP-000042` in a code comment links that file and line to an existing rule
 * (ADR-0006). It never creates rules; unknown ids are reported by the scan.
 */
export const annotationsCollector: Collector = {
  name: 'annotations',

  match(path: string): boolean {
    return CODE_FILE.test(path) && !TEST_FILE.test(path);
  },

  collect(file: SourceFile, ctx: CollectContext): RuleCandidate[] {
    const links: RuleCandidate[] = [];
    file.content.split(/\r?\n/).forEach((text, index) => {
      const line = index + 1;
      for (const match of text.matchAll(ANNOTATION)) {
        const before = text.slice(0, match.index);
        if (!COMMENT_MARKER.test(before)) continue;
        const ids = [...(match[1] ?? '').matchAll(RULE_ID)].map((m) => m[0]);
        if (ids.length === 0) {
          ctx.warn(`${file.path}:${line}: @rule needs a rule id like RP-000042`);
          continue;
        }
        for (const id of ids) {
          links.push({
            attachTo: id,
            title: `@rule ${id}`,
            origin: {
              collector: 'annotations',
              confidence: 'inferred',
              sources: [{ file: file.path, line, kind: 'annotation' }],
            },
          });
        }
      }
    });
    return links;
  },
};
