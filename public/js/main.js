// Entry point: wire everything up and run the frame loop.
import { setLevel } from './level.js';
import { connect } from './net.js';
import { initInput } from './input.js';
import { initLobby } from './ui.js';
import { initSettings, settings } from './settings.js';
import { initChat, updateChat } from './chat.js';
import { initVoice, updateVoice } from './voice.js';
import { updatePlayer } from './physics.js';
import { autoFire } from './weapons.js';
import { render } from './render/index.js';

setLevel('hell'); // the server's init message switches to the current level
initLobby();
initSettings();
initChat();
initVoice();
initInput();
connect();

const fpsEl = document.getElementById('fps');
let lastT = performance.now(), frameT = 0, frames = 0, fpsT = lastT;
function loop(t) {
  requestAnimationFrame(loop);
  // FPS cap: skip display refreshes until a frame is due (keeping to the beat, so 60 on a
  // 144Hz screen doesn't drift). Unlimited runs once per refresh.
  if (settings.fps) {
    const gap = 1000 / settings.fps;
    if (t - frameT < gap - 1) return;
    frameT = t - frameT > gap * 2 ? t : frameT + gap; // fell far behind (tab was hidden): restart the beat
  }
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  updatePlayer(dt);
  autoFire();
  render(dt);
  updateChat(t);
  updateVoice(t);

  frames++;
  if (t - fpsT >= 500) {
    fpsEl.textContent = Math.round(frames * 1000 / (t - fpsT)) + ' FPS';
    frames = 0; fpsT = t;
  }
  fpsEl.hidden = !settings.showFps;
}
requestAnimationFrame(loop);
