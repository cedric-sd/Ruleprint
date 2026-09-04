#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { exitCodeFor, type Change } from '@ruleprint/core';
import { Command } from 'commander';

import { approveProject, defaultApprover } from './approve.js';
import { buildSite } from './build.js';
import { countApproved, describeChange, summaryLine } from './report.js';
import { scanProject, serializeDocument, type ScanResult } from './scan.js';
import { createRuleBookServer } from './server.js';
import { resolveUiDist } from './ui.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const err = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
const pretty = (path: string): string => relative(process.cwd(), path) || '.';

function describeScan(result: ScanResult): string {
  const total = result.document.rules.length;
  const approved = countApproved(result.document);
  const pending = total - approved;
  const detail =
    approved === 0 ? '' : ` (${approved} approved${pending > 0 ? `, ${pending} pending` : ''})`;
  return `${total} rules${detail} from ${result.files} files`;
}

async function runScan(dir: string, outFile: string): Promise<ScanResult> {
  const result = await scanProject(dir);
  writeFileSync(outFile, serializeDocument(result.document));
  return result;
}

async function askWhichChanges(changes: readonly Change[]): Promise<string[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const chosen: string[] = [];
  try {
    for (const change of changes) {
      const answer = await rl.question(`${describeChange(change)}\n  approve? [y/N] `);
      if (/^y(es)?$/i.test(answer.trim())) chosen.push(change.id);
    }
  } finally {
    rl.close();
  }
  return chosen;
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
    const result = await runScan(root, outFile);
    if (opts.json) {
      out(
        JSON.stringify({
          out: outFile,
          rules: result.document.rules.length,
          approved: countApproved(result.document),
          files: result.files,
          warnings: result.warnings,
          changes: result.changes,
        }),
      );
      return;
    }
    for (const warning of result.warnings) err(`warning: ${warning}`);
    out(`${describeScan(result)} → ${pretty(outFile)}`);
  });

program
  .command('init')
  .description('scan the repository and explain the next steps')
  .argument('[dir]', 'repository root', '.')
  .option('-o, --out <file>', 'output file (default: <dir>/ruleprint.json)')
  .action(async (dir: string, opts: { out?: string }) => {
    const root = resolve(dir);
    const outFile = resolve(opts.out ?? resolve(root, 'ruleprint.json'));
    const result = await runScan(root, outFile);
    for (const warning of result.warnings) err(`warning: ${warning}`);
    out(`✔ ${describeScan(result)} → ${pretty(outFile)}`);
    out('');
    out('Next steps:');
    out('  npx ruleprint serve          browse the rule book at http://localhost:4141');
    out('  npx ruleprint approve --all  approve what you see; writes ruleprint.lock');
    out('  npx ruleprint check          in CI: fails when rules changed without approval');
    out('  npx ruleprint build          write a static site to ruleprint-site/');
    out('');
    out(`Commit ${pretty(outFile)} and ruleprint.lock so the rule book travels with the code.`);
  });

program
  .command('check')
  .description('compare the rules with ruleprint.lock; exit 1 when something needs approval')
  .argument('[dir]', 'repository root', '.')
  .option('--json', 'print the report as JSON', false)
  .action(async (dir: string, opts: { json: boolean }) => {
    const result = await scanProject(resolve(dir));
    const approved = countApproved(result.document);
    if (opts.json) {
      out(JSON.stringify({ approved, changes: result.changes }));
    } else {
      for (const warning of result.warnings) err(`warning: ${warning}`);
      for (const change of result.changes) out(describeChange(change));
      out(summaryLine(result.document, result.changes));
      if (result.changes.length > 0) {
        err(
          approved === 0 && Object.keys(result.lock.rules).length === 0
            ? 'No rule is approved yet. Review them and run `ruleprint approve --all`.'
            : 'Run `ruleprint approve` to review these changes, or `ruleprint approve --all`.',
        );
      }
    }
    process.exitCode = exitCodeFor(result.changes);
  });

const RULE_ID = /^RP-\d{4,}$/;

program
  .command('approve')
  .description('approve changes: writes ruleprint.lock and refreshes ruleprint.json')
  .argument('[args...]', 'rule ids to approve, optionally preceded by the repository root')
  .option('--all', 'approve every change', false)
  .option('--by <who>', 'who approves (default: git:<user.email>)')
  .action(async (args: string[], opts: { all: boolean; by?: string }) => {
    const ids = args.filter((arg) => RULE_ID.test(arg));
    const dirs = args.filter((arg) => !RULE_ID.test(arg));
    if (dirs.length > 1) throw new Error(`expected one directory, got: ${dirs.join(', ')}`);
    const root = resolve(dirs[0] ?? '.');
    let selectedIds: string[] | undefined = ids;
    if (!opts.all && ids.length === 0) {
      if (!process.stdin.isTTY) {
        throw new Error('nothing selected: pass --all or rule ids (interactive mode needs a TTY)');
      }
      const preview = await scanProject(root);
      if (preview.changes.length === 0) {
        out('Nothing to approve.');
        return;
      }
      selectedIds = await askWhichChanges(preview.changes);
      if (selectedIds.length === 0) {
        out('Nothing approved.');
        return;
      }
    }
    const approvedBy = opts.by ?? defaultApprover(root);
    const result = await approveProject(root, {
      all: opts.all,
      ...(opts.all ? {} : { ids: selectedIds }),
      ...(approvedBy !== undefined && { approvedBy }),
    });
    for (const change of result.applied) out(describeChange(change));
    out(`Approved ${result.applied.length} change(s) → ruleprint.lock; ruleprint.json refreshed`);
    out(
      summaryLine(
        result.document,
        result.scan.changes.filter((c) => !result.applied.includes(c)),
      ),
    );
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
