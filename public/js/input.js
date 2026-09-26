// Keyboard + mouse. Movement keys are read each frame in physics.js via held(); what each key
// does comes from the player's bindings in settings.js.
import { WEAPON_ORDER } from '/shared/config.js';
import { S } from './state.js';
import { canvas } from './render/canvas.js';
import { initAudio } from './audio.js';
import { fire, melee, switchWeapon, cycleWeapon, swapWeapon, reload, toggleScope } from './weapons.js';
import { dash } from './physics.js';
import { actionFor, captureKey, settingsOpen, toggleFullscreen } from './settings.js';

const locked = () => document.pointerLockElement === canvas;
const typing = e => e.target.matches('input:not([type]), input[type=text], input[type=password], textarea');

export function initInput() {
  canvas.addEventListener('click', () => { if (S.started) { initAudio(); canvas.requestPointerLock(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (typing(e) || captureKey(e)) return; // typing your name, or rebinding a key
    S.keys[e.code] = true;
    const act = actionFor(e.code);
    if (e.code === 'Space' || (act && S.started)) e.preventDefault();
    if (e.repeat) return;
    if (act === 'fullscreen') return toggleFullscreen();
    if (!S.started || !act) return;
    if (act.startsWith('slot')) switchWeapon(WEAPON_ORDER[+act.slice(4) - 1]);
    if (act === 'swap') swapWeapon();
    if (act === 'next') cycleWeapon(1);
    if (act === 'reload') reload();
    if (act === 'melee') melee(true);
    if (act === 'dash' && locked()) dash();
  });
  window.addEventListener('keyup', e => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; S.mouseHeld = false; }); // don't keep running after alt-tab

  document.addEventListener('mousemove', e => { if (locked()) { S.mouseDX += e.movementX; S.mouseDY += e.movementY; } });
  document.addEventListener('mousedown', e => {
    if (!S.started || !S.me || !locked()) return;
    if (e.button === 2) toggleScope();
    if (e.button === 0) { S.mouseHeld = true; fire(); }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) S.mouseHeld = false; });
  document.addEventListener('pointerlockchange', () => {
    document.body.classList.toggle('locked', locked()); // hides the settings button while you play
    if (!locked()) { S.mouseHeld = false; S.scoped = false; }
  });
  document.addEventListener('wheel', e => {
    if (!S.started || !locked() || settingsOpen() || performance.now() < S.switchUntil) return;
    cycleWeapon(e.deltaY < 0 ? -1 : 1);
  });
}
