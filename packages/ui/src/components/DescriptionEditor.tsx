import type { Rule } from '@ruleprint/spec';
import { useEffect, useState } from 'react';

interface Props {
  readonly rule: Rule;
  /** Whether `ruleprint serve` is behind the page (a static build is read-only). */
  readonly editable: boolean;
}

type Saving =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

/**
 * The rule's description, editable when served (ADR-0009): saving writes
 * `.ruleprint/rules/<slug>.md` through `PUT /api/rules/<id>`; the reload that follows brings
 * the rule back as declared.
 */
export function DescriptionEditor({ rule, editable }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.description ?? '');
  const [saving, setSaving] = useState<Saving>({ kind: 'idle' });

  useEffect(() => {
    setText(rule.description ?? '');
    setEditing(false);
  }, [rule.id, rule.description]);

  async function save(): Promise<void> {
    setSaving({ kind: 'saving' });
    try {
      const response = await fetch(`./api/rules/${encodeURIComponent(rule.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: text }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setSaving({ kind: 'saved' });
      setEditing(false);
    } catch (error) {
      setSaving({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!editable) {
    return rule.description ? (
      <p className="description">{rule.description}</p>
    ) : (
      <p className="description muted">
        No description yet. Run <code>ruleprint serve</code> to write one here, or
        <code> ruleprint describe {rule.id} "…"</code>.
      </p>
    );
  }

  if (!editing) {
    return (
      <div className="description-block">
        {rule.description ? (
          <p className="description">{rule.description}</p>
        ) : (
          <p className="description muted">No description yet.</p>
        )}
        <p className="description-actions">
          <button type="button" className="button" onClick={() => setEditing(true)}>
            {rule.description ? 'Edit description' : 'Describe this rule'}
          </button>
          {saving.kind === 'saved' && (
            <span className="saved">Saved to .ruleprint/rules/ · the rule is declared now</span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="description-block">
      <label className="visually-hidden" htmlFor="description">
        Description
      </label>
      <textarea
        id="description"
        className="description-input"
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="When does the rule apply, what are its exceptions, who owns it?"
        autoFocus
      />
      <p className="description-actions">
        <button
          type="button"
          className="button primary"
          disabled={saving.kind === 'saving' || text.trim() === ''}
          onClick={() => void save()}
        >
          {saving.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="button"
          disabled={saving.kind === 'saving'}
          onClick={() => {
            setText(rule.description ?? '');
            setEditing(false);
            setSaving({ kind: 'idle' });
          }}
        >
          Cancel
        </button>
        <span className="hint">
          Saved as <code>.ruleprint/rules/&lt;slug&gt;.md</code>; the rule becomes declared.
        </span>
        {saving.kind === 'error' && <span className="error">Could not save: {saving.message}</span>}
      </p>
    </div>
  );
}
