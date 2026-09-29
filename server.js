// Pistols and Potion — Networked 3D Shooter
// Run: npm start   (or npm run dev to restart on file changes)
// Then: npx ngrok http 3000  (or ngrok http 3000)
// Everyone opens the URL; share a room's invite link to play together.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { staticHandler } from './server/static.js';
import { Hub } from './server/hub.js';
import { clientIp } from './server/log.js';
import { openProfiles } from './server/profiles.js';
import { VERSION } from './server/version.js';
import { TICK, WIN_SCORE, TEAM_WIN_SCORE, MAX_PLAYERS } from './shared/config.js';

const PORT = Number(process.env.PORT) || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean).map(value => {
  let origin;
  try { origin = new URL(value).origin; } catch { throw new Error(`Invalid ALLOWED_ORIGINS entry: ${value}`); }
  if (production && new URL(origin).protocol !== 'https:') throw new Error('Production ALLOWED_ORIGINS must use https://');
  return origin;
}));
const maxConnections = Math.max(1, Number(process.env.MAX_CONNECTIONS) || 100);
const maxConnectionsPerIp = Math.max(1, Number(process.env.MAX_CONNECTIONS_PER_IP) || 20);

if (production && !allowedOrigins.size) throw new Error('ALLOWED_ORIGINS is required in production');
if (production && process.env.TRUST_PROXY !== '1') throw new Error('Set TRUST_PROXY=1 behind the HTTPS hosting proxy');

const serveStatic = staticHandler(root);
const server = http.createServer((req, res) => {
  if (production && process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-proto'] !== 'https') {
    res.writeHead(308, { Location: `${[...allowedOrigins][0]}${req.url}` });
    res.end();
    return;
  }
  serveStatic(req, res);
});
const hub = new Hub(await openProfiles(root));
const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
const connectionsByIp = new Map();

function originAllowed(origin) {
  if (allowedOrigins.has(origin)) return true;
  if (production || !origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  } catch { return false; }
}

server.on('upgrade', (req, socket, head) => {
  const ip = clientIp(req, process.env.TRUST_PROXY === '1');
  const count = connectionsByIp.get(ip) || 0;
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { pathname = ''; }
  if (pathname !== '/' || !originAllowed(req.headers.origin)
    || (production && req.headers['x-forwarded-proto'] !== 'https')
    || wss.clients.size >= maxConnections || count >= maxConnectionsPerIp) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => {
    connectionsByIp.set(ip, count + 1);
    ws.once('close', () => {
      const next = (connectionsByIp.get(ip) || 1) - 1;
      if (next > 0) connectionsByIp.set(ip, next); else connectionsByIp.delete(ip);
    });
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (socket, req) => {
  socket.alive = true;
  socket.on('pong', () => socket.alive = true);
  hub.connect(socket, clientIp(req, process.env.TRUST_PROXY === '1'), req.url);
});
// drop connections that stopped answering (closed laptop, lost signal) so they don't linger in rooms
setInterval(() => wss.clients.forEach(s => {
  if (!s.alive) return s.terminate();
  s.alive = false;
  s.ping();
}), 30000);
setInterval(() => hub.tick(), TICK);

// Render stops the old server with SIGTERM when it deploys a new one (and Ctrl+C sends SIGINT):
// tell everyone it's restarting, let stat saves land, then go. Their pages reconnect by themselves
let stopping = false;
async function shutdown(signal) {
  if (stopping) process.exit(1); // asked twice: go now
  stopping = true;
  console.log(`\n${signal}: restarting — telling everyone`);
  hub.announceRestart();
  await Promise.race([hub.saving, new Promise(r => setTimeout(r, 4000))]);
  setTimeout(() => process.exit(0), 1500); // time for the message to reach them
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  console.log(`
  PISTOLS & POTION v${VERSION} — 3D Shooter
  Local:  http://localhost:${PORT}
  Remote: ngrok http ${PORT}, then share the ngrok URL.

  Maps: Witch Swamp / Gothic Castle / Brimstone Coven / Frost Hollow / Pumpkin Hollow / Alchemist's Lab / Hexed Manor
  WASD + mouse, SPACE jump (hold = bhop), E pick up, R reload, 1-3/Q weapon, RMB scope, F melee
  Rooms of up to ${MAX_PLAYERS}. Free-for-all: first to ${WIN_SCORE} kills. Teams: first team to ${TEAM_WIN_SCORE}.
`);
});
