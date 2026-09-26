// Keyboard + mouse. Movement keys are read each frame in physics.js via S.keys.
import { WEAPON_ORDER } from '/shared/config.js';
import { S } from './state.js';
import { canvas } from './render/canvas.js';
import { initAudio } from './audio.js';
import { fire, melee, switchWeapon, cycleWeapon, toggleScope } from './weapons.js';

const locked = () => document.pointerLockElement === canvas;

export function initInput() {
  canvas.addEventListener('click', () => { if (S.started) { initAudio(); canvas.requestPointerLock(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return; // typing your name in the lobby
    const k = e.key.toLowerCase();
    S.keys[k] = true;
    if (k === ' ') e.preventDefault();
    if (!S.started) return;
    const n = parseInt(k, 10);
    if (n >= 1 && n <= WEAPON_ORDER.length) switchWeapon(WEAPON_ORDER[n - 1]);
    if (k === 'q') cycleWeapon(1);
    if (k === 'f') melee(true);
  });
  window.addEventListener('keyup', e => { S.keys[e.key.toLowerCase()] = false; });

  document.addEventListener('mousemove', e => { if (locked()) { S.mouseDX += e.movementX; S.mouseDY += e.movementY; } });
  document.addEventListener('mousedown', e => {
    if (!S.started || !S.me || !locked()) return;
    if (e.button === 2) toggleScope();
    if (e.button === 0) { S.mouseHeld = true; fire(); }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) S.mouseHeld = false; });
  document.addEventListener('pointerlockchange', () => { if (!locked()) { S.mouseHeld = false; S.scoped = false; } });
  document.addEventListener('wheel', e => {
    if (!S.started || !locked() || performance.now() < S.switchUntil) return;
    cycleWeapon(e.deltaY < 0 ? -1 : 1);
  });
}
