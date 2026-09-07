import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Rule } from '@ruleprint/spec';

import { scanProject, type ScanOptions } from './scan.js';

export interface PromoteOptions {
  readonly scanOptions?: ScanOptions;
}

export interface PromoteResult {
  /** Absolute path of the file written. */
  readonly path: string;
  readonly rule: Rule;
}

const RULES_DIR = join('.ruleprint', 'rules');

export function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'rule'
  );
}

function frontMatterValue(value: string): string {
  return /[:#[\]{}"'\n]|^\s|\s$/.test(value) ? JSON.stringify(value) : value;
}

/** Markdown for `.ruleprint/rules/*.md` that declares `rule` (ADR-0006). */
export function renderDeclaration(rule: Rule): string {
  const lines = ['---', `id: ${rule.id}`, `title: ${frontMatterValue(rule.title)}`];
  if (rule.tags && rule.tags.length > 0) {
    lines.push(`tags: [${rule.tags.map(frontMatterValue).join(', ')}]`);
  }
  lines.push('---', '');
  if (rule.description !== undefined && rule.description.trim() !== '') {
    lines.push(rule.description.trim(), '');
  } else {
    lines.push(
      '<!-- Describe the rule in business language: when it applies, its exceptions, who owns it. -->',
      '',
    );
  }
  return lines.join('\n');
}

/**
 * Promotes a rule to a declared one: writes `.ruleprint/rules/<slug>.md` with its id, title,
 * tags and description. The next scan merges the file with the rule's evidence.
 */
export async function promoteRule(
  dir: string,
  id: string,
  options: PromoteOptions = {},
): Promise<PromoteResult> {
  const root = resolve(dir);
  const scan = await scanProject(root, options.scanOptions);
  const rule = scan.document.rules.find((r) => r.id === id);
  if (!rule)
    throw new Error(`${id} is not a rule in ${root} (run \`ruleprint scan\` to see the ids)`);
  const declaredIn = rule.origin.sources.find((source) => source.kind === 'config');
  if (declaredIn) throw new Error(`${id} is already declared in ${declaredIn.file}`);

  const rulesDir = join(root, RULES_DIR);
  mkdirSync(rulesDir, { recursive: true });
  const path = join(rulesDir, `${slugify(rule.title)}.md`);
  if (existsSync(path))
    throw new Error(`${path} already exists; pick the id up from that file or rename it`);
  writeFileSync(path, renderDeclaration(rule));
  return { path, rule };
}
