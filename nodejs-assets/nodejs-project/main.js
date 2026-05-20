/**
 * Node.js HTTP server running inside nodejs-mobile-react-native.
 * All database queries are delegated back to the React Native side
 * via rn-bridge — the RN side owns the SQLite connection.
 *
 * Auth model: per-member endpoints require `Authorization: Bearer <token>`.
 * The token is issued by /api/auth/member after PIN verification and is
 * validated server-side via the `validateSession` bridge action. The browser
 * gate page (/gate, /gate/login) is unchanged and continues to verify PIN
 * on every check-in.
 */
const rn_bridge = require('rn-bridge');
const http = require('http');
const url = require('url');
const dgram = require('dgram');

const PORT = 3000;
const DISCOVERY_PORT = 41234;

let beaconSocket = null;
let beaconInterval = null;

function startBeacon() {
  beaconSocket = dgram.createSocket('udp4');
  beaconSocket.bind(() => {
    beaconSocket.setBroadcast(true);
    const msg = Buffer.from(JSON.stringify({ type: 'bookleaf_beacon', name: 'Bookleaf Library', port: PORT }));
    beaconInterval = setInterval(() => {
      beaconSocket.send(msg, 0, msg.length, DISCOVERY_PORT, '255.255.255.255');
    }, 3000);
  });
}

function stopBeacon() {
  if (beaconInterval) { clearInterval(beaconInterval); beaconInterval = null; }
  if (beaconSocket) { try { beaconSocket.close(); } catch {} beaconSocket = null; }
}

// Pending request map: requestId -> resolve function
const pending = new Map();
let nextId = 0;

/**
 * Send a query to the RN side and await the response.
 */
function queryRN(action, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, resolve);

    rn_bridge.channel.send(JSON.stringify({ requestId: id, action, params }));

    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`RN query timeout: ${action}`));
      }
    }, 15000);
  });
}

// Receive responses from RN side
rn_bridge.channel.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw);

    if (msg.type === 'stop') {
      stopBeacon();
      server.close(() => process.exit(0));
      return;
    }

    if (msg.requestId !== undefined) {
      const resolve = pending.get(msg.requestId);
      if (resolve) {
        resolve(msg.data);
        pending.delete(msg.requestId);
      }
    }
  } catch (e) {
    // malformed message — ignore
  }
});

function send(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

/**
 * Extract Bearer token from the Authorization header and resolve it to a
 * SessionPrincipal via the RN bridge. Returns null if the header is missing,
 * malformed, or the token is invalid/expired.
 */
async function authResolve(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];
  try {
    const principal = await queryRN('validateSession', { token });
    return principal || null;
  } catch {
    return null;
  }
}

const GATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Library Gate Check-in</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#F4F9F4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:20px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(42,92,51,.1)}
  h1{color:#2A5C33;font-size:22px;font-weight:800;margin-bottom:4px}
  p{color:#7A9A7E;font-size:13px;margin-bottom:24px}
  label{display:block;font-size:12px;font-weight:700;color:#2A5C33;margin-bottom:6px;letter-spacing:.5px;text-transform:uppercase}
  input{width:100%;border:1.5px solid #D1E8D0;border-radius:12px;padding:13px 16px;font-size:15px;color:#1C2B1E;outline:none;margin-bottom:16px}
  input:focus{border-color:#2A5C33}
  button{width:100%;background:#5CB85C;color:#fff;border:none;border-radius:14px;padding:15px;font-size:16px;font-weight:700;cursor:pointer}
  button:active{background:#2A5C33}
  .msg{margin-top:20px;padding:14px 16px;border-radius:12px;font-size:14px;font-weight:600;text-align:center}
  .in{background:#DCFCE7;color:#16A34A}
  .out{background:#FEF3C7;color:#D97706}
  .err{background:#FEE2E2;color:#DC2626}
</style>
</head>
<body>
<div class="card">
  <h1>📚 Library Gate</h1>
  <p>Enter your library ID and PIN to check in or out.</p>
  <form id="f">
    <label>Library ID</label>
    <input id="id" type="text" autocomplete="off" placeholder="e.g. 2024-001" required/>
    <label>PIN</label>
    <input id="pin" type="password" placeholder="4-digit PIN" required/>
    <button type="submit">Check In / Out</button>
  </form>
  <div id="msg"></div>
</div>
<script>
document.getElementById('f').addEventListener('submit',async function(e){
  e.preventDefault();
  const btn=document.querySelector('button');
  btn.disabled=true;btn.textContent='Please wait…';
  const msgEl=document.getElementById('msg');
  msgEl.className='msg';msgEl.textContent='';
  try{
    const r=await fetch(location.pathname+'/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idNumber:document.getElementById('id').value,pin:document.getElementById('pin').value})
    });
    const d=await r.json();
    if(!r.ok||d.error){msgEl.className='msg err';msgEl.textContent=d.error||'Login failed.';}
    else{
      const dir=d.direction==='in'?'✅ Checked IN':'👋 Checked OUT';
      msgEl.className='msg '+(d.direction==='in'?'in':'out');
      msgEl.textContent=dir+' — '+d.user_name;
      document.getElementById('id').value='';
      document.getElementById('pin').value='';
    }
  }catch{msgEl.className='msg err';msgEl.textContent='Cannot reach server.';}
  finally{btn.disabled=false;btn.textContent='Check In / Out';}
});
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const query = parsed.query;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  try {
    // GET /ping
    if (req.method === 'GET' && path === '/ping') {
      return send(res, 200, { ok: true, timestamp: new Date().toISOString() });
    }

    // GET /api/books?q=&type=&yearFrom=&yearTo=&language=
    if (req.method === 'GET' && path === '/api/books') {
      const hasFilters = query.type || query.yearFrom || query.yearTo || query.language;
      if (hasFilters || query.q) {
        const data = await queryRN('searchBooksFiltered', {
          query: query.q || '',
          materialType: query.type || undefined,
          yearFrom: query.yearFrom ? parseInt(query.yearFrom) : undefined,
          yearTo: query.yearTo ? parseInt(query.yearTo) : undefined,
          language: query.language || undefined,
        });
        return send(res, 200, data);
      }
      const data = await queryRN('getAllBooks', {});
      return send(res, 200, data);
    }

    // GET /api/books/recent
    if (req.method === 'GET' && path === '/api/books/recent') {
      const data = await queryRN('getRecentlyAdded', { limit: parseInt(query.limit) || 10 });
      return send(res, 200, data);
    }

    // GET /api/books/popular
    if (req.method === 'GET' && path === '/api/books/popular') {
      const data = await queryRN('getPopular', { limit: parseInt(query.limit) || 10 });
      return send(res, 200, data);
    }

    // GET /api/books/:id
    const bookMatch = path.match(/^\/api\/books\/(\d+)$/);
    if (req.method === 'GET' && bookMatch) {
      const data = await queryRN('getBookDetail', { id: parseInt(bookMatch[1]) });
      if (!data) return send(res, 404, { error: 'Book not found' });
      return send(res, 200, data);
    }

    // GET /api/books/:id/similar
    const similarMatch = path.match(/^\/api\/books\/(\d+)\/similar$/);
    if (req.method === 'GET' && similarMatch) {
      const data = await queryRN('getSimilarBooks', { resourceId: parseInt(similarMatch[1]) });
      return send(res, 200, data);
    }

    // GET /api/books/:id/reviews
    const reviewsGetMatch = path.match(/^\/api\/books\/(\d+)\/reviews$/);
    if (req.method === 'GET' && reviewsGetMatch) {
      const data = await queryRN('getBookReviews', { resourceId: parseInt(reviewsGetMatch[1]) });
      return send(res, 200, data);
    }

    // POST /api/books/:id/reviews — requires auth
    const reviewsPostMatch = path.match(/^\/api\/books\/(\d+)\/reviews$/);
    if (req.method === 'POST' && reviewsPostMatch) {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      const body = await readBody(req);
      let rating, comment;
      try { ({ rating, comment } = JSON.parse(body)); } catch { return send(res, 400, { error: 'Invalid body' }); }
      try {
        const data = await queryRN('submitReview', {
          resourceId: parseInt(reviewsPostMatch[1]),
          userId: principal.user_id,
          rating,
          comment: comment || null,
        });
        return send(res, 200, data);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // GET /api/books/:id/favorite — requires auth (per-user state)
    const favGetMatch = path.match(/^\/api\/books\/(\d+)\/favorite$/);
    if (req.method === 'GET' && favGetMatch) {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      const data = await queryRN('getFavoriteStatus', {
        resourceId: parseInt(favGetMatch[1]),
        userId: principal.user_id,
      });
      return send(res, 200, data);
    }

    // POST /api/books/:id/favorite — requires auth
    const favPostMatch = path.match(/^\/api\/books\/(\d+)\/favorite$/);
    if (req.method === 'POST' && favPostMatch) {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      try {
        const data = await queryRN('toggleFavorite', {
          resourceId: parseInt(favPostMatch[1]),
          userId: principal.user_id,
        });
        return send(res, 200, data);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // POST /api/books/:id/reserve — requires auth
    const reserveMatch = path.match(/^\/api\/books\/(\d+)\/reserve$/);
    if (req.method === 'POST' && reserveMatch) {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      try {
        const data = await queryRN('reserveBook', {
          resourceId: parseInt(reserveMatch[1]),
          userId: principal.user_id,
        });
        return send(res, 200, data);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // POST /api/borrows/:id/renew — requires auth
    const renewMatch = path.match(/^\/api\/borrows\/(\d+)\/renew$/);
    if (req.method === 'POST' && renewMatch) {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      try {
        const data = await queryRN('renewBorrow', {
          borrowingId: parseInt(renewMatch[1]),
          userId: principal.user_id,
        });
        return send(res, 200, data);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // GET /api/me/borrows — requires auth
    if (req.method === 'GET' && path === '/api/me/borrows') {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      const data = await queryRN('getMemberBorrows', { userId: principal.user_id });
      if (!data) return send(res, 404, { error: 'Member not found' });
      return send(res, 200, data);
    }

    // GET /api/me/reservations — requires auth
    if (req.method === 'GET' && path === '/api/me/reservations') {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      const data = await queryRN('getMemberReservations', { userId: principal.user_id });
      if (!data) return send(res, 404, { error: 'Member not found' });
      return send(res, 200, data);
    }

    // GET /api/me/favorites — requires auth
    if (req.method === 'GET' && path === '/api/me/favorites') {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      const data = await queryRN('getMemberFavorites', { userId: principal.user_id });
      if (!data) return send(res, 404, { error: 'Member not found' });
      return send(res, 200, data);
    }

    // GET /gate — browser self-check-in HTML page
    if (req.method === 'GET' && path === '/gate') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(GATE_HTML);
    }

    // POST /gate/login — browser form submission (idNumber + pin + institutionId)
    if (req.method === 'POST' && path === '/gate/login') {
      const body = await readBody(req);
      let idNumber, pin, institutionId;
      try {
        ({ idNumber, pin, institutionId } = JSON.parse(body));
      } catch {
        return send(res, 400, { error: 'Invalid request body.' });
      }
      const data = await queryRN('gateVerifyAndLog', { idNumber, pin, institutionId: institutionId || 1 });
      if (!data) return send(res, 401, { error: 'Invalid ID or PIN.' });
      return send(res, 200, data);
    }

    // POST /api/auth/member — client-side patron login (idNumber + pin)
    if (req.method === 'POST' && path === '/api/auth/member') {
      const body = await readBody(req);
      let idNumber, pin;
      try { ({ idNumber, pin } = JSON.parse(body)); } catch { return send(res, 400, { error: 'Invalid body' }); }
      if (!idNumber || !pin) return send(res, 400, { error: 'idNumber and pin are required' });
      const data = await queryRN('authenticateMember', { idNumber, pin });
      if (!data || data.error || !data.user || !data.token) return send(res, 401, { error: 'Invalid ID or PIN' });
      return send(res, 200, data);
    }

    // POST /api/auth/logout — revoke the current session
    if (req.method === 'POST' && path === '/api/auth/logout') {
      const header = req.headers['authorization'] || req.headers['Authorization'];
      const match = header && typeof header === 'string' && header.match(/^Bearer\s+(\S+)$/i);
      if (match) {
        try { await queryRN('logout', { token: match[1] }); } catch {}
      }
      return send(res, 200, { ok: true });
    }

    // POST /api/gate/log — app clients log attendance (auth via token)
    if (req.method === 'POST' && path === '/api/gate/log') {
      const principal = await authResolve(req);
      if (!principal) return send(res, 401, { error: 'Unauthorized' });
      const data = await queryRN('gateLogByUserId', {
        userId: principal.user_id,
        institutionId: principal.institution_id,
        method: 'app',
      });
      if (!data) return send(res, 404, { error: 'Member not found.' });
      return send(res, 200, data);
    }

    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_ready', port: PORT }));
  startBeacon();
});

server.on('error', (err) => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_error', message: err.message }));
});
