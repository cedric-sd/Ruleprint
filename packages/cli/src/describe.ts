import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Rule } from '@ruleprint/spec';

import { renderDeclaration, slugify } from './promote.js';
import { scanProject, type ScanOptions } from './scan.js';

export interface DescribeOptions {
  readonly scanOptions?: ScanOptions;
}

export interface DescribeResult {
  /** Absolute path of the markdown file written. */
  readonly path: string;
  /** True when the rule was not declared yet and a new file was created. */
  readonly created: boolean;
  /** The rule after the description, as the next scan sees it. */
  readonly rule: Rule;
}

const RULES_DIR = join('.ruleprint', 'rules');
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---/;

/**
 * Writes a description for a rule (ADR-0009). A rule that is not declared yet becomes one:
 * `.ruleprint/rules/<slug>.md` with its id, title, tags and the text. A declared rule keeps its
 * markdown front-matter byte for byte and gets the text as its body.
 */
export async function describeRule(
  dir: string,
  id: string,
  description: string,
  options: DescribeOptions = {},
): Promise<DescribeResult> {
  const root = resolve(dir);
  const text = description.trim();
  if (text === '') throw new Error('description is empty');

  const scan = await scanProject(root, options.scanOptions);
  const rule = scan.document.rules.find((r) => r.id === id);
  if (!rule)
    throw new Error(`${id} is not a rule in ${root} (run \`ruleprint scan\` to see the ids)`);

  const declaredIn = rule.origin.sources.find((source) => source.kind === 'config');
  let path: string;
  let created: boolean;
  if (declaredIn) {
    path = join(root, scan.prefix ? declaredIn.file.slice(scan.prefix.length) : declaredIn.file);
    const current = readFileSync(path, 'utf8');
    const frontMatter = FRONT_MATTER.exec(current)?.[0];
    writeFileSync(path, frontMatter ? `${frontMatter}\n\n${text}\n` : `${text}\n`);
    created = false;
  } else {
    const rulesDir = join(root, RULES_DIR);
    mkdirSync(rulesDir, { recursive: true });
    path = join(rulesDir, `${slugify(rule.title)}.md`);
    if (existsSync(path))
      throw new Error(`${path} already exists; pick the id up from that file or rename it`);
    writeFileSync(path, renderDeclaration({ ...rule, description: text }));
    created = true;
  }

  const after = await scanProject(root, options.scanOptions);
  const updated = after.document.rules.find((r) => r.id === id);
  if (!updated) throw new Error(`${id} disappeared after writing ${path}`);
  return { path, created, rule: updated };
}
