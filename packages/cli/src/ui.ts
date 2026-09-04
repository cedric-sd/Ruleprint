import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** Directory with the built web UI (`@ruleprint/ui/dist`). */
export function resolveUiDist(): string {
  const require = createRequire(import.meta.url);
  const dist = join(dirname(require.resolve('@ruleprint/ui/package.json')), 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(
      `The RulePrint UI is not built (${dist}). In the workspace run \`pnpm build\`; from npm, reinstall the package.`,
    );
  }
  return dist;
}
