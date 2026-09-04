import type { Project, RuleSource } from '@ruleprint/spec';

/** Browsable URL for a source location, when the project declares a repository. */
export function sourceUrl(project: Project, source: RuleSource): string | undefined {
  if (!project.repository) return undefined;
  const base = project.repository.replace(/\/+$/, '');
  const ref = project.commit ?? 'HEAD';
  const anchor = source.line !== undefined ? `#L${source.line}` : '';
  return `${base}/blob/${ref}/${source.file}${anchor}`;
}

export function sourceLabel(source: RuleSource): string {
  return source.line !== undefined ? `${source.file}:${source.line}` : source.file;
}
