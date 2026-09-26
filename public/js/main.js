// Entry point: wire everything up and run the frame loop.
import { setLevel } from './level.js';
import { connect } from './net.js';
import { initInput } from './input.js';
import { initLobby } from './ui.js';
import { updatePlayer } from './physics.js';
import { autoFire } from './weapons.js';
import { render } from './render/index.js';

setLevel('hell'); // the server's init message switches to the current level
initLobby();
initInput();
connect();

let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  updatePlayer(dt);
  autoFire();
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
