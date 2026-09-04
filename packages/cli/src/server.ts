import { createReadStream, existsSync, statSync, watch, type FSWatcher } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';

import { scanProject, serializeDocument, type ScanOptions } from './scan.js';

export interface ServerOptions {
  readonly dir: string;
  readonly uiDist: string;
  readonly port: number;
  readonly host?: string;
  /** Watch `dir` and rescan on change (default true). */
  readonly watch?: boolean;
  readonly scanOptions?: ScanOptions;
  readonly log?: (message: string) => void;
}

export interface RuleBookServer {
  readonly port: number;
  readonly url: string;
  rescan(): Promise<void>;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const IGNORED_CHANGES = /(^|[\\/])(node_modules|dist|build|coverage|\.git|\.ruleprint)([\\/]|$)/;
const DEBOUNCE_MS = 150;

function staticPath(uiDist: string, pathname: string): string | undefined {
  const root = resolve(uiDist);
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return undefined;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return undefined;
  return candidate;
}

function sendFile(res: ServerResponse, file: string): void {
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

export async function createRuleBookServer(options: ServerOptions): Promise<RuleBookServer> {
  const log = options.log ?? (() => undefined);
  const dir = resolve(options.dir);
  let body = '';
  const clients = new Set<ServerResponse>();

  async function rescan(): Promise<void> {
    const result = await scanProject(dir, options.scanOptions);
    body = serializeDocument(result.document);
    for (const warning of result.warnings) log(`warning: ${warning}`);
    log(`${result.document.rules.length} rules from ${result.files} files`);
    for (const client of clients) client.write('event: reload\ndata: {}\n\n');
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }

    if (pathname === '/ruleprint.json') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] ?? '', 'Cache-Control': 'no-cache' });
      res.end(body);
      return;
    }
    if (pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const file = staticPath(options.uiDist, pathname) ?? join(options.uiDist, 'index.html');
    sendFile(res, file);
  }

  await rescan();

  let watcher: FSWatcher | undefined;
  let timer: NodeJS.Timeout | undefined;
  if (options.watch ?? true) {
    try {
      watcher = watch(dir, { recursive: true }, (_event, filename) => {
        if (filename && IGNORED_CHANGES.test(String(filename))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          rescan().catch((error: unknown) => log(`rescan failed: ${String(error)}`));
        }, DEBOUNCE_MS);
      });
      watcher.on('error', (error) => log(`watch error: ${String(error)}`));
    } catch (error) {
      log(`hot reload unavailable (${String(error)}); restart to pick up changes`);
    }
  }

  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': ping\n\n');
  }, 30_000);
  heartbeat.unref();

  const server = createServer(handle);
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(options.port, options.host ?? '127.0.0.1', () => done());
  });
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    url: `http://${options.host ?? 'localhost'}:${port}`,
    rescan,
    close: async () => {
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      watcher?.close();
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
