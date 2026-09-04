import type { RulePrintDocument } from '@ruleprint/spec';
import { useEffect, useState } from 'react';

import { RuleDetail } from './components/RuleDetail.js';
import { RuleList } from './components/RuleList.js';
import { EMPTY_FILTER, type RuleFilter } from './lib/filter.js';
import { parseHash } from './lib/route.js';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; document: RulePrintDocument };

async function load(): Promise<RulePrintDocument> {
  const response = await fetch('./ruleprint.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`ruleprint.json: HTTP ${response.status}`);
  return (await response.json()) as RulePrintDocument;
}

function useDocument(): State {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      load()
        .then((document) => {
          if (!cancelled) setState({ kind: 'ready', document });
        })
        .catch((error: unknown) => {
          if (!cancelled) setState({ kind: 'error', message: String(error) });
        });
    };
    refresh();

    // `ruleprint serve` pushes a reload event after every rescan; static builds have no stream.
    let events: EventSource | undefined;
    if (typeof EventSource !== 'undefined') {
      events = new EventSource('./events');
      events.addEventListener('reload', refresh);
      events.onerror = () => events?.close();
    }
    return () => {
      cancelled = true;
      events?.close();
    };
  }, []);

  return state;
}

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const state = useDocument();
  const route = parseHash(useHash());
  const [filter, setFilter] = useState<RuleFilter>(EMPTY_FILTER);

  if (state.kind === 'loading') return <p className="notice">Loading rule book…</p>;
  if (state.kind === 'error')
    return <p className="notice error">Could not load: {state.message}</p>;

  const { document } = state;
  const selected = route.ruleId
    ? document.rules.find((rule) => rule.id === route.ruleId)
    : undefined;

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand">
          RulePrint
        </a>
        <span className="project">
          {document.project.name}
          {document.project.commit && <code> @ {document.project.commit.slice(0, 7)}</code>}
        </span>
        <span className="generated">generated {document.generatedAt}</span>
      </header>
      <main>
        {route.ruleId && !selected && <p className="notice">Rule {route.ruleId} not found.</p>}
        {selected ? (
          <RuleDetail project={document.project} rule={selected} />
        ) : (
          <RuleList rules={document.rules} filter={filter} onFilter={setFilter} />
        )}
      </main>
    </>
  );
}
