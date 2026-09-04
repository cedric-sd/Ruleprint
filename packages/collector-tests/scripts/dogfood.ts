// Runs the tests collector over a directory tree and prints what it finds.
//   pnpm --filter @ruleprint/collector-tests dogfood [dir] [--json]
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import type { RuleCandidate } from '@ruleprint/core';

import { testsCollector } from '../src/index.js';

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        yield* walk(join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const root = resolve(args.find((arg) => !arg.startsWith('--')) ?? '.');

const warnings: string[] = [];
const byFile = new Map<string, RuleCandidate[]>();

for (const abs of walk(root)) {
  const path = relative(root, abs).split('\\').join('/');
  if (!testsCollector.match(path)) continue;
  const candidates = await testsCollector.collect(
    { path, content: readFileSync(abs, 'utf8') },
    { warn: (message) => warnings.push(message) },
  );
  byFile.set(path, candidates);
}

const all = [...byFile.values()].flat();

if (json) {
  process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
} else {
  for (const [path, candidates] of byFile) {
    process.stdout.write(`${path} (${candidates.length})\n`);
    for (const candidate of candidates) {
      process.stdout.write(`  - ${candidate.title}\n`);
    }
  }
  process.stdout.write(`\n${all.length} candidates from ${byFile.size} files\n`);
}
for (const warning of warnings) {
  process.stderr.write(`warning: ${warning}\n`);
}
