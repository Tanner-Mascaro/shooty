// Arena — Networked 3D Shooter
// Run: npm start   (or npm run dev to restart on file changes)
// Then: npx ngrok http 3000  (or ngrok http 3000)
// Both players open the URL.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { staticHandler } from './server/static.js';
import { Game } from './server/game.js';
import { clientIp } from './server/log.js';
import { TICK, WIN_SCORE } from './shared/config.js';

const PORT = Number(process.env.PORT) || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));

const server = http.createServer(staticHandler(root));
const game = new Game();
new WebSocketServer({ server }).on('connection', (socket, req) => game.connect(socket, clientIp(req)));
setInterval(() => game.tick(), TICK);

server.listen(PORT, () => {
  console.log(`
  ARENA — 3D Shooter
  Local:  http://localhost:${PORT}
  Remote: ngrok http ${PORT}, then share the ngrok URL with P2.

  Levels: Hell / Robot Factory / Witch Swamp
  WASD + mouse, SPACE jump (hold = bhop), 1-5/Q weapon, RMB scope, F melee
  First to ${WIN_SCORE} kills wins.
`);
});
