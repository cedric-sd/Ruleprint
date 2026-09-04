#!/usr/bin/env node
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';

import { Command } from 'commander';

import { buildSite } from './build.js';
import { scanProject, serializeDocument } from './scan.js';
import { createRuleBookServer } from './server.js';
import { resolveUiDist } from './ui.js';
import { writeFileSync } from 'node:fs';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const err = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
const pretty = (path: string): string => relative(process.cwd(), path) || '.';

async function runScan(
  dir: string,
  outFile: string,
): Promise<{ rules: number; files: number; warnings: readonly string[] }> {
  const result = await scanProject(dir);
  writeFileSync(outFile, serializeDocument(result.document));
  return { rules: result.document.rules.length, files: result.files, warnings: result.warnings };
}

const program = new Command()
  .name('ruleprint')
  .description('Generates a browsable book of business rules from a repository.')
  .version(version);

program
  .command('scan')
  .description('collect rules and write ruleprint.json')
  .argument('[dir]', 'repository root', '.')
  .option('-o, --out <file>', 'output file (default: <dir>/ruleprint.json)')
  .option('--json', 'print a machine-readable summary', false)
  .action(async (dir: string, opts: { out?: string; json: boolean }) => {
    const root = resolve(dir);
    const outFile = resolve(opts.out ?? resolve(root, 'ruleprint.json'));
    const summary = await runScan(root, outFile);
    if (opts.json) {
      out(JSON.stringify({ out: outFile, ...summary }));
      return;
    }
    for (const warning of summary.warnings) err(`warning: ${warning}`);
    out(`${summary.rules} rules from ${summary.files} files → ${pretty(outFile)}`);
  });

program
  .command('init')
  .description('scan the repository and explain the next steps')
  .argument('[dir]', 'repository root', '.')
  .option('-o, --out <file>', 'output file (default: <dir>/ruleprint.json)')
  .action(async (dir: string, opts: { out?: string }) => {
    const root = resolve(dir);
    const outFile = resolve(opts.out ?? resolve(root, 'ruleprint.json'));
    const summary = await runScan(root, outFile);
    for (const warning of summary.warnings) err(`warning: ${warning}`);
    out(`✔ ${summary.rules} rules from ${summary.files} files → ${pretty(outFile)}`);
    out('');
    out('Next steps:');
    out('  npx ruleprint serve    browse the rule book at http://localhost:4141');
    out('  npx ruleprint build    write a static site to ruleprint-site/');
    out('');
    out(`Commit ${pretty(outFile)} so the rule book travels with the code.`);
  });

program
  .command('serve')
  .description('serve the rule book with hot reload')
  .argument('[dir]', 'repository root', '.')
  .option('-p, --port <port>', 'port', '4141')
  .option('--host <host>', 'host', '127.0.0.1')
  .option('--no-watch', 'do not watch for changes')
  .action(async (dir: string, opts: { port: string; host: string; watch: boolean }) => {
    const server = await createRuleBookServer({
      dir: resolve(dir),
      uiDist: resolveUiDist(),
      port: Number(opts.port),
      host: opts.host,
      watch: opts.watch,
      log: err,
    });
    out(`RulePrint at ${server.url}${opts.watch ? ' (watching for changes)' : ''}`);
    const stop = (): void => {
      void server.close().finally(() => process.exit(0));
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

program
  .command('build')
  .description('write a static site with the rule book')
  .argument('[dir]', 'repository root', '.')
  .option('-o, --out <dir>', 'output directory', 'ruleprint-site')
  .action(async (dir: string, opts: { out: string }) => {
    const result = await buildSite({
      dir: resolve(dir),
      out: resolve(opts.out),
      uiDist: resolveUiDist(),
    });
    for (const warning of result.warnings) err(`warning: ${warning}`);
    out(`${result.rules} rules from ${result.files} files → ${pretty(result.out)}/`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  err(`ruleprint: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
