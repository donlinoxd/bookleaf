import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initApp } from './server';
import { createSqliteAdapter } from './adapter/sqlite';
import { startBeacon, stopBeacon } from './beacon';

// SQL migration files — bundled as text strings by esbuild (loader: { '.sql': 'text' })
// @ts-expect-error — imported as plain text by esbuild, not a real module
import sql_0000 from '../../../packages/db/drizzle/0000_init.sql';
// @ts-expect-error
import sql_0001 from '../../../packages/db/drizzle/0001_sessions.sql';
// @ts-expect-error — imported as plain text by esbuild
import sql_0002 from '../../../packages/db/drizzle/0002_import_jobs.sql';
// @ts-expect-error — imported as plain text by esbuild
import sql_0003 from '../../../packages/db/drizzle/0003_authority_control.sql';
// @ts-expect-error — imported as plain text by esbuild
import sql_0004 from '../../../packages/db/drizzle/0004_material_fields.sql';
// @ts-expect-error — imported as plain text by esbuild
import sql_0005 from '../../../packages/db/drizzle/0005_loan_rules.sql';

const PORT = 3000;

// Tauri passes the app data directory as an env var when spawning the sidecar.
// Falls back to ./library.db for local testing without Tauri.
const dbPath = process.env.BOOKLEAF_DB_PATH ?? './library.db';

// Ensure the parent directory exists
mkdirSync(dirname(dbPath), { recursive: true });

const db = createSqliteAdapter(dbPath, sql_0000 as string, sql_0001 as string, sql_0002 as string, sql_0003 as string, sql_0004 as string, sql_0005 as string);
const app = initApp({ db });

const server = createServer(async (req, res) => {
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bookleaf-server] listening on http://0.0.0.0:${PORT}`);
  startBeacon(PORT);
});

server.on('error', (err) => {
  console.error('[bookleaf-server] error:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  stopBeacon();
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  stopBeacon();
  server.close(() => process.exit(0));
});
