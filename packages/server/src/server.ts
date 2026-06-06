import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { networkInterfaces } from 'os';
import { appRouter } from './router';
import type { DbAdapter } from './adapter/types';
import type { TRPCContext } from './trpc';
import { GATE_HTML } from './gate-html';
import { rateLimitCheck, rateLimitRecordFailure, rateLimitRecordSuccess } from './middleware/rateLimit';

function getLanIp(): string | null {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

async function createContext(
  req: Request,
  db: DbAdapter,
): Promise<TRPCContext> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  let principal: TRPCContext['principal'] = null;
  let token: string | null = null;
  if (header) {
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (match) {
      token = match[1];
      principal = await db.validateSession(token);
    }
  }
  return { db, principal, token };
}

export function initApp({ db }: { db: DbAdapter }): Hono {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  app.get('/ping', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));

  app.get('/info', async (c) => {
    const info = await db.getInstitutionInfo();
    const lanIp = getLanIp();
    return c.json({ ...info, serverUrl: lanIp ? `http://${lanIp}:3000` : null });
  });

  // Browser gate page (served as HTML to patron's mobile browser)
  app.get('/gate', (c) => c.html(GATE_HTML));

  // Browser gate login — PIN-per-request, no token issued
  app.post('/gate/login', async (c) => {
    let body: { idNumber?: string; pin?: string; institutionId?: number };
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request body.' }, 400); }
    const { idNumber, pin, institutionId = 1 } = body;
    if (!idNumber || !pin) return c.json({ error: 'idNumber and pin are required.' }, 400);
    const rl = rateLimitCheck(`gate:${idNumber}`);
    if (rl.blocked) {
      return c.json(
        { error: 'Too many failed attempts. Try again later.', retry_after: rl.retryAfter },
        429,
      );
    }
    const data = await db.gateVerifyAndLog(idNumber, pin, institutionId);
    if (!data) {
      rateLimitRecordFailure(`gate:${idNumber}`);
      return c.json({ error: 'Invalid ID or PIN.' }, 401);
    }
    rateLimitRecordSuccess(`gate:${idNumber}`);
    return c.json(data);
  });

  // tRPC endpoint — handles all /trpc/* routes
  app.all('/trpc/*', async (c) => {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: () => createContext(c.req.raw, db),
    });
  });

  return app;
}
