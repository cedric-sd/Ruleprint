import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { testsCollector } from '@ruleprint/collector-tests';
import {
  assembleDocument,
  collectFromFiles,
  emptyLock,
  type Change,
  type Collector,
  type LockFile,
  type SourceFile,
} from '@ruleprint/core';
import type { Project, RulePrintDocument } from '@ruleprint/spec';

import { currentCommit, pathPrefixInRepo, repositoryUrl } from './git.js';
import { readLock } from './lock-io.js';

export interface ScanOptions {
  /** Clock override, for reproducible output. */
  readonly now?: Date;
  /** Read commit and remote from git (default true). */
  readonly git?: boolean;
  /** Collectors to run (default: the tests collector). */
  readonly collectors?: readonly Collector[];
  /**
   * Lock to reconcile against. Omitted: `<dir>/ruleprint.lock` is read when present.
   * `null`: ignore any lock (every rule comes out pending).
   */
  readonly lock?: LockFile | null;
}

export interface ScanResult {
  readonly document: RulePrintDocument;
  /** What differs from the lock (ADR-0005); empty when everything is approved. */
  readonly changes: readonly Change[];
  /** The lock the scan was reconciled against (empty when there is none). */
  readonly lock: LockFile;
  readonly warnings: readonly string[];
  /** Number of files handed to collectors. */
  readonly files: number;
}

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.ruleprint']);

export const DEFAULT_COLLECTORS: readonly Collector[] = [testsCollector];

function* walk(dir: string): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

function projectName(dir: string): string {
  const manifest = join(dir, 'package.json');
  if (existsSync(manifest)) {
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown };
      if (typeof parsed.name === 'string' && parsed.name.trim() !== '') return parsed.name;
    } catch {
      // fall through to the directory name
    }
  }
  return basename(dir);
}

function describeProject(dir: string, useGit: boolean): Project {
  const project: Project = { name: projectName(dir) };
  if (!useGit) return project;
  const commit = currentCommit(dir);
  if (commit) project.commit = commit;
  const repository = repositoryUrl(dir);
  if (repository) project.repository = repository;
  return project;
}

/** Collects every rule candidate under `dir` and assembles a `ruleprint.json` document. */
export async function scanProject(dir: string, options: ScanOptions = {}): Promise<ScanResult> {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`${root} is not a directory`);
  }
  const collectors = options.collectors ?? DEFAULT_COLLECTORS;
  const useGit = options.git ?? true;
  const prefix = useGit ? pathPrefixInRepo(root) : '';

  const files: SourceFile[] = [];
  for (const abs of walk(root)) {
    const path = prefix + toPosix(relative(root, abs));
    if (collectors.some((collector) => collector.match(path))) {
      files.push({ path, content: readFileSync(abs, 'utf8') });
    }
  }

  const warnings: string[] = [];
  const candidates = await collectFromFiles(files, collectors, {
    warn: (message) => warnings.push(message),
  });
  const lock =
    options.lock === null ? emptyLock() : (options.lock ?? readLock(root) ?? emptyLock());
  const { document, changes } = await assembleDocument({
    project: describeProject(root, useGit),
    candidates,
    generatedAt: (options.now ?? new Date()).toISOString(),
    lock,
  });
  return { document, changes, lock, warnings, files: files.length };
}

export function serializeDocument(document: RulePrintDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
