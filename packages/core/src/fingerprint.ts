import type { RuleCandidate } from './collector.js';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Provisional fingerprint (ADR-0004): SHA-256 of the collector, the title and each source's
 * file and symbol. Line numbers are deliberately left out so moving code does not count as
 * drift. M4 replaces the material with the normalised AST of the origin, keeping the format.
 */
export async function fingerprintCandidate(candidate: RuleCandidate): Promise<string> {
  const material = [
    candidate.origin.collector,
    candidate.title,
    ...candidate.origin.sources.map((source) => `${source.file}:${source.symbol ?? ''}`),
  ].join('\n');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(material));
  return `sha256:${toHex(digest)}`;
}
