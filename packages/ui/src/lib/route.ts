export interface Route {
  readonly ruleId?: string;
}

/** `#/rules/RP-000001` selects a rule; anything else is the list. */
export function parseHash(hash: string): Route {
  const match = /^#\/rules\/([^/?#]+)/.exec(hash);
  return match?.[1] ? { ruleId: decodeURIComponent(match[1]) } : {};
}

export function ruleHash(ruleId: string): string {
  return `#/rules/${encodeURIComponent(ruleId)}`;
}
