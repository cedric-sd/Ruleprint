// Generates src/types.generated.ts from ruleprint.schema.json.
// Run with `pnpm --filter @ruleprint/spec generate` (or `pnpm generate` at the root).
// CI fails if the committed file is out of date.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'json-schema-to-typescript';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(packageRoot, 'src', 'ruleprint.schema.json');
const outputPath = join(packageRoot, 'src', 'types.generated.ts');
const prettierConfigPath = join(packageRoot, '..', '..', '.prettierrc');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const style = JSON.parse(await readFile(prettierConfigPath, 'utf8'));

const output = await compile(schema, 'RulePrintDocument', {
  bannerComment: [
    '/**',
    ' * GENERATED FILE. DO NOT EDIT.',
    ' * Source: packages/spec/src/ruleprint.schema.json',
    ' * Regenerate with: pnpm --filter @ruleprint/spec generate',
    ' */',
  ].join('\n'),
  additionalProperties: false,
  style,
});

await writeFile(outputPath, output);
console.log(`wrote ${outputPath}`);
