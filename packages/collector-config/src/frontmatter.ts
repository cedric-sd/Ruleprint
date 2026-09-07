/**
 * The front-matter subset RulePrint understands (ADR-0006): `key: value` (quotes optional),
 * inline lists `key: [a, b]` and block lists (`key:` followed by `- item` lines). Anything else
 * is an error, on purpose: the file is meant to be tiny and predictable.
 */
export type FrontMatterValue = string | string[];

export interface ParsedDocument {
  readonly data: Readonly<Record<string, FrontMatterValue>>;
  readonly body: string;
}

export type FrontMatterResult =
  { ok: true; document: ParsedDocument } | { ok: false; error: string };

const KEY_LINE = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;
const ITEM_LINE = /^\s*-\s+(.*)$/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineList(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map(unquote);
}

export function parseFrontMatter(content: string): FrontMatterResult {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { ok: true, document: { data: {}, body: content } };
  }
  const lines = content.split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return { ok: false, error: 'front-matter is not closed with ---' };

  const data: Record<string, FrontMatterValue> = {};
  let listKey: string | undefined;
  for (const [offset, line] of lines.slice(1, end).entries()) {
    const lineNumber = offset + 2;
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const item = ITEM_LINE.exec(line);
    if (item?.[1] !== undefined && listKey !== undefined) {
      (data[listKey] as string[]).push(unquote(item[1]));
      continue;
    }

    const keyLine = KEY_LINE.exec(line);
    if (!keyLine?.[1]) return { ok: false, error: `line ${lineNumber}: expected "key: value"` };
    const key = keyLine[1];
    const rawValue = keyLine[2];
    if (key in data) return { ok: false, error: `line ${lineNumber}: duplicate key ${key}` };
    if (rawValue === undefined || rawValue.trim() === '') {
      data[key] = [];
      listKey = key;
      continue;
    }
    listKey = undefined;
    const trimmed = rawValue.trim();
    data[key] =
      trimmed.startsWith('[') && trimmed.endsWith(']')
        ? parseInlineList(trimmed)
        : unquote(trimmed);
  }

  return { ok: true, document: { data, body: lines.slice(end + 1).join('\n') } };
}
