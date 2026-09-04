import type { CollectContext, Collector, RuleCandidate, SourceFile } from './collector.js';

/**
 * Runs every collector whose `match` accepts a file over that file, in file order, and
 * concatenates the candidates. Collectors run sequentially so the output is deterministic.
 */
export async function collectFromFiles(
  files: readonly SourceFile[],
  collectors: readonly Collector[],
  ctx: CollectContext,
): Promise<RuleCandidate[]> {
  const candidates: RuleCandidate[] = [];
  for (const file of files) {
    for (const collector of collectors) {
      if (collector.match(file.path)) {
        candidates.push(...(await collector.collect(file, ctx)));
      }
    }
  }
  return candidates;
}
