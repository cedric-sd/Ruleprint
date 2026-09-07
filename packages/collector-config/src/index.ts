import type { CollectContext, Collector, RuleCandidate, SourceFile } from '@ruleprint/core';

import { parseFrontMatter, type FrontMatterValue } from './frontmatter.js';

export const PACKAGE_NAME = '@ruleprint/collector-config' as const;

const RULE_FILE = /(?:^|\/)\.ruleprint\/rules\/.+\.md$/;
const RULE_ID = /^RP-\d{4,}$/;
const KNOWN_KEYS = new Set(['id', 'title', 'tags']);
const HEADING = /^#\s+(.+?)\s*$/m;

function asList(value: FrontMatterValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter((v) => v !== '');
}

function titleFromFileName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/, '').replace(/[-_]+/g, ' ').trim();
}

/** Fingerprint material: title, whitespace-collapsed description and sorted tags (ADR-0006). */
function normalize(
  title: string,
  description: string | undefined,
  tags: readonly string[] | undefined,
): string {
  return JSON.stringify([
    title,
    (description ?? '').replace(/\s+/g, ' ').trim(),
    [...(tags ?? [])].sort(),
  ]);
}

/**
 * Declared rules: `.ruleprint/rules/**\/*.md` with an optional front-matter (`id`, `title`,
 * `tags`). A file with `id` joins the rule of that id; without it, it defines a new rule.
 */
export const configCollector: Collector = {
  name: 'config',

  match(path: string): boolean {
    return RULE_FILE.test(path);
  },

  collect(file: SourceFile, ctx: CollectContext): RuleCandidate[] {
    const parsed = parseFrontMatter(file.content);
    if (!parsed.ok) {
      ctx.warn(`${file.path}: ${parsed.error}`);
      return [];
    }
    const { data } = parsed.document;
    let body = parsed.document.body;

    for (const key of Object.keys(data)) {
      if (!KNOWN_KEYS.has(key)) {
        ctx.warn(`${file.path}: unknown front-matter key "${key}" (allowed: id, title, tags)`);
        return [];
      }
    }

    const rawId = data['id'];
    if (rawId !== undefined && (typeof rawId !== 'string' || !RULE_ID.test(rawId))) {
      ctx.warn(`${file.path}: id must look like RP-000042, got ${JSON.stringify(rawId)}`);
      return [];
    }

    let title = typeof data['title'] === 'string' ? data['title'].trim() : '';
    if (title === '' && data['title'] === undefined) {
      const heading = HEADING.exec(body);
      if (heading?.[1]) {
        title = heading[1];
        body = body.replace(heading[0], '');
      } else {
        title = titleFromFileName(file.path);
      }
    }
    if (title === '') {
      ctx.warn(`${file.path}: title is empty`);
      return [];
    }

    const tags = asList(data['tags']);
    const description = body.trim() === '' ? undefined : body.trim();

    const candidate: RuleCandidate = {
      ...(rawId !== undefined && { id: rawId }),
      title,
      ...(description !== undefined && { description }),
      ...(tags !== undefined && tags.length > 0 && { tags }),
      normalized: normalize(title, description, tags),
      origin: {
        collector: 'config',
        confidence: 'declared',
        sources: [{ file: file.path, line: 1, kind: 'config' }],
      },
    };
    return [candidate];
  },
};

export { parseFrontMatter } from './frontmatter.js';
