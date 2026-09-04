import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Node built-ins that `packages/core` must never touch.
 * Core is pure: no filesystem, no process, no network.
 * See CLAUDE.md and docs/ROADMAP.md ("invariantes de arquitetura").
 */
const NODE_BUILTINS_FORBIDDEN_IN_CORE = [
  'fs',
  'fs/promises',
  'path',
  'process',
  'os',
  'child_process',
  'http',
  'https',
  'http2',
  'net',
  'dns',
  'tls',
  'url',
  'worker_threads',
];

const restrictedPaths = NODE_BUILTINS_FORBIDDEN_IN_CORE.flatMap((name) => [
  { name, message: `packages/core is pure: importing "${name}" is forbidden.` },
  {
    name: `node:${name}`,
    message: `packages/core is pure: importing "node:${name}" is forbidden.`,
  },
]);

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.generated.ts',
      'examples/**',
      'pnpm-lock.yaml',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Root config files and package scripts are not covered by any package tsconfig.
    files: ['*.js', '*.ts', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Package scripts run under plain Node.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: restrictedPaths }],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'packages/core is pure: `process` is forbidden.' },
      ],
    },
  },
  prettier,
);
