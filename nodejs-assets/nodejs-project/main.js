/**
 * Node.js HTTP server running inside nodejs-mobile-react-native.
 * All database queries are delegated back to the React Native side
 * via rn-bridge — the RN side owns the SQLite connection.
 */
const rn_bridge = require('rn-bridge');
const http = require('http');
const url = require('url');

const PORT = 3000;

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
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const query = parsed.query;

  try {
    // GET /ping
    if (req.method === 'GET' && path === '/ping') {
      return send(res, 200, { ok: true, timestamp: new Date().toISOString() });
    }

    // GET /api/books?q=<query>
    if (req.method === 'GET' && path === '/api/books') {
      const data = await queryRN(query.q ? 'searchBooks' : 'getAllBooks', { q: query.q || '' });
      return send(res, 200, data);
    }

    // GET /api/books/:id
    const bookMatch = path.match(/^\/api\/books\/(\d+)$/);
    if (req.method === 'GET' && bookMatch) {
      const data = await queryRN('getBookDetail', { id: parseInt(bookMatch[1]) });
      if (!data) return send(res, 404, { error: 'Book not found' });
      return send(res, 200, data);
    }

    // GET /api/members/:idNumber/borrows
    const memberMatch = path.match(/^\/api\/members\/([^/]+)\/borrows$/);
    if (req.method === 'GET' && memberMatch) {
      const idNumber = decodeURIComponent(memberMatch[1]);
      const data = await queryRN('getMemberBorrows', { idNumber });
      if (!data) return send(res, 404, { error: 'Member not found' });
      return send(res, 200, data);
    }

    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_ready', port: PORT }));
});

server.on('error', (err) => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_error', message: err.message }));
});
