// Entry point: wire everything up and run the frame loop.
// On the bare home/sign-in screen we skip terrain build and the rAF loop so the menu stays snappy.
import { setLevel } from './level.js';
import { connect } from './net.js';
import { initInput } from './input.js';
import { initLobby } from './ui.js';
import { initSettings, settings } from './settings.js';
import { initChat, updateChat } from './chat.js';
import { initVoice, updateVoice } from './voice.js';
import { updatePlayer } from './physics.js';
import { updateSpectate } from './spectate.js';
import { autoFire } from './weapons.js';
import { render } from './render/index.js';
import { homeOpen, onHomeLeave } from './home.js';
import { warmLobby } from './room.js';
import { flushFriends } from './friends.js';
import { ensureCanvas } from './render/canvas.js';
import { S } from './state.js';
import { initMap } from './mapview.js';
import { initTouch } from './touch.js';
import { initGamepad, updateGamepad } from './gamepad.js';
import { initTutorial } from './tutorial.js';
import { initWiki } from './wiki.js';

initLobby();
initSettings();
initChat();
initVoice();
initInput();
initMap();
initTouch();
initGamepad();
initTutorial();
initWiki();
connect();

const fpsEl = document.getElementById('fps');
let lastT = performance.now(), frameT = 0, frames = 0, fpsT = lastT;
let raf = 0;

function ensureWorld() {
  if (!S.T) setLevel(S.level || 'hell');
}

function startLoop() {
  if (raf) return;
  ensureCanvas();
  warmLobby();
  flushFriends();
  ensureWorld();
  lastT = performance.now();
  frameT = lastT;
  raf = requestAnimationFrame(loop);
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  // FPS cap: skip display refreshes until a frame is due (keeping to the beat, so 60 on a
  // 144Hz screen doesn't drift). Unlimited runs once per refresh.
  if (settings.fps) {
    const gap = 1000 / settings.fps;
    if (t - frameT < gap - 1) return;
    frameT = t - frameT > gap * 2 ? t : frameT + gap; // fell far behind (tab was hidden): restart the beat
  }
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  updateGamepad(dt);
  if (S.dead && S.started) updateSpectate(dt); else updatePlayer(dt);
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

// home/sign-in: no 3D world and no frame loop until they enter a room (full navigation) or land with ?room=
onHomeLeave(startLoop);
if (!homeOpen()) startLoop();

