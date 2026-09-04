import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Workspace packages resolve to their sources in tests; Node uses `dist` (see package exports).
    alias: [
      {
        find: /^@ruleprint\/([^/]+)$/,
        replacement: resolve(import.meta.dirname, 'packages/$1/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
});
