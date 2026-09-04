import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scanProject, serializeDocument, type ScanOptions } from './scan.js';

export interface BuildOptions {
  readonly dir: string;
  readonly out: string;
  readonly uiDist: string;
  readonly scanOptions?: ScanOptions;
}

export interface BuildResult {
  readonly out: string;
  readonly rules: number;
  readonly files: number;
  readonly warnings: readonly string[];
}

/** Writes a static, self-contained site (UI + `ruleprint.json`) to `out`. */
export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  const result = await scanProject(options.dir, options.scanOptions);
  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  cpSync(options.uiDist, out, { recursive: true });
  writeFileSync(join(out, 'ruleprint.json'), serializeDocument(result.document));
  return {
    out,
    rules: result.document.rules.length,
    files: result.files,
    warnings: result.warnings,
  };
}
