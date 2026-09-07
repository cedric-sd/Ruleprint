import type { RuleCandidate } from './collector.js';

const ID_SPACE = 1_000_000;
const encoder = new TextEncoder();

/** 32-bit FNV-1a over the UTF-8 bytes of `input`. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(input)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function formatId(n: number): string {
  return `RP-${String(n).padStart(6, '0')}`;
}

/**
 * Provisional rule id derived from the collector and the title (ADR-0004): stable across runs
 * and independent of file order. The lock (M4) will preserve ids across renames.
 */
export function idForKey(collector: string, title: string): string {
  return formatId(fnv1a32(`${collector}\0${title}`) % ID_SPACE);
}

function sortKey(candidate: RuleCandidate): string {
  const [source] = candidate.origin.sources;
  return [
    candidate.origin.collector,
    candidate.title,
    source.file,
    String(source.line ?? 0).padStart(9, '0'),
  ].join('\0');
}

/**
 * Assigns a unique id to every candidate. Collisions within the document (and with `reserved`
 * ids, e.g. those the lock already uses) are resolved by taking the next free number, walking
 * the candidates in a deterministic order so the result does not depend on the order of the
 * input. The returned array is parallel to `candidates`.
 */
export function assignIds(
  candidates: readonly RuleCandidate[],
  reserved: ReadonlySet<string> = new Set(),
): string[] {
  const order = candidates
    .map((candidate, index) => ({ index, key: sortKey(candidate) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const taken = new Set<number>();
  for (const id of reserved) {
    const n = Number(id.slice(3));
    if (Number.isInteger(n)) taken.add(n);
  }
  const ids = new Array<string>(candidates.length);
  for (const { index } of order) {
    const candidate = candidates[index];
    if (!candidate) continue;
    let n = fnv1a32(`${candidate.origin.collector}\0${candidate.title}`) % ID_SPACE;
    while (taken.has(n)) {
      n = (n + 1) % ID_SPACE;
    }
    taken.add(n);
    ids[index] = formatId(n);
  }
  return ids;
}
