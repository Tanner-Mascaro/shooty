// Shooty — Networked 3D Shooter
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
import { TICK, WIN_SCORE, TEAM_WIN_SCORE, MAX_PLAYERS } from './shared/config.js';

const PORT = Number(process.env.PORT) || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));

const server = http.createServer(staticHandler(root));
const hub = new Hub(await openProfiles(root));
const wss = new WebSocketServer({ server });
wss.on('connection', (socket, req) => {
  socket.alive = true;
  socket.on('pong', () => socket.alive = true);
  hub.connect(socket, clientIp(req), req.url);
});
// drop connections that stopped answering (closed laptop, lost signal) so they don't linger in rooms
setInterval(() => wss.clients.forEach(s => {
  if (!s.alive) return s.terminate();
  s.alive = false;
  s.ping();
}), 30000);
setInterval(() => hub.tick(), TICK);

server.listen(PORT, () => {
  console.log(`
  SHOOTY — 3D Shooter
  Local:  http://localhost:${PORT}
  Remote: ngrok http ${PORT}, then share the ngrok URL.

  Levels: Hell / Robot Factory / Witch Swamp
  WASD + mouse, SPACE jump (hold = bhop), E pick up, R reload, 1-3/Q weapon, RMB scope, F melee
  Rooms of up to ${MAX_PLAYERS}. Free-for-all: first to ${WIN_SCORE} kills. Teams: first team to ${TEAM_WIN_SCORE}.
`);
});
