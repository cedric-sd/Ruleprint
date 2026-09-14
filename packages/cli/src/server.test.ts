import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRuleBookServer, type RuleBookServer } from './server.js';

const REPO_ROOT = join(import.meta.dirname, '../../..');
const FIXTURE = join(REPO_ROOT, 'examples/fixture-express-api');

function fakeUiDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ruleprint-ui-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>fake ui</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")');
  return dir;
}

async function readSseEvent(url: string, trigger: () => Promise<void>): Promise<string> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = response.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) throw new Error('no body');
  await trigger();
  let received = '';
  for (let i = 0; i < 5 && !received.includes('event: reload'); i += 1) {
    const { value, done } = await reader.read();
    if (done) break;
    received += new TextDecoder().decode(value);
  }
  controller.abort();
  return received;
}

function freshFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ruleprint-serve-'));
  cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !src.endsWith('ruleprint.lock') });
  return dir;
}

describe('createRuleBookServer()', () => {
  let server: RuleBookServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('serves the UI, the document and a reload stream', async () => {
    server = await createRuleBookServer({
      dir: FIXTURE,
      uiDist: fakeUiDist(),
      port: 0,
      watch: false,
      scanOptions: { git: false },
    });
    const base = `http://127.0.0.1:${server.port}`;

    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('fake ui');

    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('javascript');

    const doc = await fetch(`${base}/ruleprint.json`);
    expect(doc.status).toBe(200);
    const body = (await doc.json()) as { rules: unknown[] };
    expect(body.rules).toHaveLength(21);

    const deep = await fetch(`${base}/rules/RP-000001`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('fake ui');

    const escape = await fetch(`${base}/..%2F..%2Fpackage.json`);
    expect([200, 404]).toContain(escape.status);
    expect(await escape.text()).not.toContain('"name"');

    const event = await readSseEvent(`${base}/events`, () => server?.rescan() ?? Promise.resolve());
    expect(event).toContain('event: reload');
  });

  it('saves a description written in the UI as a declared rule and reloads (ADR-0009)', async () => {
    const dir = freshFixture();
    server = await createRuleBookServer({
      dir,
      uiDist: fakeUiDist(),
      port: 0,
      watch: false,
      scanOptions: { git: false },
    });
    const base = `http://127.0.0.1:${server.port}`;

    const status = await fetch(`${base}/api/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ editable: true });

    const before = (await (await fetch(`${base}/ruleprint.json`)).json()) as {
      rules: { id: string; title: string; description?: string }[];
    };
    const target = before.rules.find(
      (r) => r.title === 'order validation > rejects an empty order',
    );
    if (!target) throw new Error('rule not found');
    expect(target.description).toBeUndefined();

    const event = await readSseEvent(`${base}/events`, async () => {
      const put = await fetch(`${base}/api/rules/${target.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'Um pedido precisa de ao menos um item.' }),
      });
      expect(put.status).toBe(200);
      const payload = (await put.json()) as {
        id: string;
        path: string;
        rule: { description?: string };
      };
      expect(payload.id).toBe(target.id);
      expect(payload.path).toBe('.ruleprint/rules/order-validation-rejects-an-empty-order.md');
      expect(payload.rule.description).toBe('Um pedido precisa de ao menos um item.');
    });
    expect(event).toContain('event: reload');
    expect(
      existsSync(join(dir, '.ruleprint/rules/order-validation-rejects-an-empty-order.md')),
    ).toBe(true);

    const after = (await (await fetch(`${base}/ruleprint.json`)).json()) as {
      rules: { id: string; description?: string; origin: { confidence: string } }[];
    };
    expect(after.rules.find((r) => r.id === target.id)).toMatchObject({
      description: 'Um pedido precisa de ao menos um item.',
      origin: { confidence: 'declared' },
    });

    const unknown = await fetch(`${base}/api/rules/RP-999999`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'x' }),
    });
    expect(unknown.status).toBe(404);
    const malformed = await fetch(`${base}/api/rules/${target.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(malformed.status).toBe(400);
    const empty = await fetch(`${base}/api/rules/${target.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '  ' }),
    });
    expect(empty.status).toBe(400);
    const wrongMethod = await fetch(`${base}/api/rules/${target.id}`, { method: 'DELETE' });
    expect(wrongMethod.status).toBe(405);
  });
});
