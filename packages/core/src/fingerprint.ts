import type { RuleCandidate } from './collector.js';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function material(candidate: RuleCandidate): string {
  if (candidate.normalized !== undefined) {
    // ADR-0005: the normalised origin; file and line stay out so moving code is not drift.
    return `${candidate.origin.collector}\n${candidate.normalized}`;
  }
  // ADR-0004 fallback for collectors without a normalised form.
  return [
    candidate.origin.collector,
    candidate.title,
    ...candidate.origin.sources.map((source) => `${source.file}:${source.symbol ?? ''}`),
  ].join('\n');
}

/** `sha256:` + SHA-256 of the candidate's fingerprint material. */
export async function fingerprintCandidate(candidate: RuleCandidate): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(material(candidate)),
  );
  return `sha256:${toHex(digest)}`;
}
