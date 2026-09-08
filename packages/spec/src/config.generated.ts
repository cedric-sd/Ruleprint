/**
 * GENERATED FILE. DO NOT EDIT.
 * Source: packages/spec/src/ruleprint.config.schema.json
 * Regenerate with: pnpm --filter @ruleprint/spec generate
 */

/**
 * Contents of .ruleprint/config.json: opt-in collectors and their settings.
 */
export interface RulePrintConfig {
  ast?: AstConfig;
}
/**
 * Settings of the AST collector (ADR-0007). Present means enabled.
 */
export interface AstConfig {
  /**
   * Globs, relative to the scanned root, of the files to analyse (e.g. src/domain/**).
   *
   * @minItems 1
   */
  include: [string, ...string[]];
  /**
   * Globs of files to leave out even when included.
   */
  exclude?: string[];
  /**
   * Domain terms; an identifier containing one of them counts as a domain signal.
   */
  glossary?: string[];
}
