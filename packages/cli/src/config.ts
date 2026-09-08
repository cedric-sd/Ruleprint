import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { annotationsCollector } from '@ruleprint/collector-annotations';
import { createAstCollector } from '@ruleprint/collector-ast';
import { configCollector } from '@ruleprint/collector-config';
import { testsCollector } from '@ruleprint/collector-tests';
import type { Collector } from '@ruleprint/core';
import { validateConfig, type RulePrintConfig } from '@ruleprint/spec';

export const CONFIG_FILE = join('.ruleprint', 'config.json');

/** `<dir>/.ruleprint/config.json`, validated; `{}` when absent. Throws on an invalid file. */
export function readConfig(dir: string): RulePrintConfig {
  const path = join(dir, CONFIG_FILE);
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE}: not valid JSON (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
  const result = validateConfig(parsed);
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ');
    throw new Error(`${CONFIG_FILE}: ${details}`);
  }
  return result.config;
}

/** Tests, declarations and links always; the AST collector when the config enables it. */
export function collectorsFor(config: RulePrintConfig): Collector[] {
  const collectors: Collector[] = [testsCollector, configCollector, annotationsCollector];
  if (config.ast) collectors.push(createAstCollector(config.ast));
  return collectors;
}
