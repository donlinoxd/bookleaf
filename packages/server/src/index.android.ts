// rn-bridge is provided by nodejs-mobile at runtime — not an npm package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rn_bridge = require('rn-bridge') as {
  channel: {
    send(data: string): void;
    on(event: 'message', listener: (data: string) => void): void;
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('http') as typeof import('http');

import { initApp } from './server';
import { createBridgeAdapter } from './adapter/bridge';
import { startBeacon, stopBeacon } from './beacon';

const PORT = 3000;

// ── Bridge message passing ────────────────────────────────────────────────────
const pending = new Map<number, (data: unknown) => void>();
let nextId = 0;

function queryRN(action: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, resolve);
    rn_bridge.channel.send(JSON.stringify({ requestId: id, action, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`RN query timeout: ${action}`));
      }
    }, 15_000);
  });
}

// ── Hono app ──────────────────────────────────────────────────────────────────
const db = createBridgeAdapter(queryRN);
const app = initApp({ db });

// ── HTTP server (Node.js http → Hono fetch interface) ─────────────────────────
const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  const bodyBuf = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const url = `http://0.0.0.0:${PORT}${req.url ?? '/'}`;
  const fetchReq = new Request(url, {
    method: req.method ?? 'GET',
    headers: req.headers as unknown as Headers,
    body: bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined,
  });

  const fetchRes = await app.fetch(fetchReq);

  const headers: Record<string, string> = {};
  fetchRes.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(fetchRes.status, headers);
  const buf = await fetchRes.arrayBuffer();
  res.end(Buffer.from(buf));
});

// ── Message routing: stop signal + DB response callbacks ─────────────────────
rn_bridge.channel.on('message', (raw: string) => {
  try {
    const msg = JSON.parse(raw) as { type?: string; requestId?: number; data?: unknown };
    if (msg.type === 'stop') {
      stopBeacon();
      server.close(() => process.exit(0));
      return;
    }
    if (typeof msg.requestId === 'number') {
      const resolve = pending.get(msg.requestId);
      if (resolve) {
        resolve(msg.data);
        pending.delete(msg.requestId);
      }
    }
  } catch {
    // malformed message — ignore
  }
});

server.listen(PORT, '0.0.0.0', () => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_ready', port: PORT }));
  startBeacon(PORT);
});

server.on('error', (err: Error) => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_error', message: err.message }));
});
