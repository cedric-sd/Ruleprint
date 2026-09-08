// Generates src/types.generated.ts from ruleprint.schema.json.
// Run with `pnpm --filter @ruleprint/spec generate` (or `pnpm generate` at the root).
// CI fails if the committed file is out of date.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'json-schema-to-typescript';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const prettierConfigPath = join(packageRoot, '..', '..', '.prettierrc');
const style = JSON.parse(await readFile(prettierConfigPath, 'utf8'));

const targets = [
  { schema: 'ruleprint.schema.json', output: 'types.generated.ts', name: 'RulePrintDocument' },
  {
    schema: 'ruleprint.config.schema.json',
    output: 'config.generated.ts',
    name: 'RulePrintConfig',
  },
];

for (const target of targets) {
  const schemaPath = join(packageRoot, 'src', target.schema);
  const outputPath = join(packageRoot, 'src', target.output);
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const output = await compile(schema, target.name, {
    bannerComment: [
      '/**',
      ' * GENERATED FILE. DO NOT EDIT.',
      ` * Source: packages/spec/src/${target.schema}`,
      ' * Regenerate with: pnpm --filter @ruleprint/spec generate',
      ' */',
    ].join('\n'),
    additionalProperties: false,
    style,
  });
  await writeFile(outputPath, output);
  console.log(`wrote ${outputPath}`);
}
