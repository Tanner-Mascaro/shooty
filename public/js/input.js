// Keyboard + mouse. Movement keys are read each frame in physics.js via held(); what each key
// does comes from the player's bindings in settings.js.
import { S } from './state.js';
import { canvas } from './render/canvas.js';
import { initAudio } from './audio.js';
import { fire, melee, switchSlot, cycleWeapon, swapWeapon, reload, aim, use, throwNade } from './weapons.js';
import { actionFor, captureKey, settingsOpen, openSettings, toggleFullscreen } from './settings.js';
import { openChat, chatOpen } from './chat.js';
import { askMic } from './voice.js';
import { dash } from './physics.js';
import { send } from './net.js';

const locked = () => document.pointerLockElement === canvas;
const typing = e => e.target.matches('input:not([type]), input[type=text], input[type=password], textarea') || chatOpen();

export function initInput() {
  canvas.addEventListener('click', () => {
    if (!S.started || chatOpen()) return;
    initAudio();
    canvas.requestPointerLock();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (typing(e) || captureKey(e)) return; // typing your name / chat, or rebinding a key
    S.keys[e.code] = true;
    const act = actionFor(e.code);
    if (e.code === 'Space' || (act && S.started)) e.preventDefault();
    if (e.repeat) return;
    if (act === 'fullscreen') return toggleFullscreen();
    if (act === 'settings') return openSettings();
    if (act === 'chat') { e.preventDefault(); return openChat(); }
    if (act === 'talk') askMic(); // first press asks for the mic
    if (act === 'slide' && !S.clawsOnly) S.slideArmed = true;
    if (!S.started || !act) return;
    if (act.startsWith('slot')) switchSlot(+act.slice(4));
    if (act === 'swap') swapWeapon();
    if (act === 'use') use();
    if (act === 'reload') reload();
    if (act === 'melee') melee(true);
    if (act === 'slide' && S.clawsOnly && locked()) dash();
    if (act === 'nade') throwNade();
    if (act === 'respawn') send({ type: 'respawn' });
  });
  window.addEventListener('keyup', e => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; S.mouseHeld = false; }); // don't keep running after alt-tab

  document.addEventListener('mousemove', e => { if (locked()) { S.mouseDX += e.movementX; S.mouseDY += e.movementY; } });
  document.addEventListener('mousedown', e => {
    if (!S.started || !S.me || !locked()) return;
    if (e.button === 2) aim(true);
    if (e.button === 0) { S.mouseHeld = true; fire(); }
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) S.mouseHeld = false;
    if (e.button === 2) aim(false);
  });
  document.addEventListener('pointerlockchange', () => {
    document.body.classList.toggle('locked', locked()); // hides the settings button while you play
    if (!locked()) { S.mouseHeld = false; S.aimHeld = false; S.scoped = false; }
  });
  document.addEventListener('wheel', e => {
    // switchUntil only gates firing / nades — always allow scrolling to another gun
    if (!S.started || !locked() || settingsOpen()) return;
    cycleWeapon(e.deltaY < 0 ? -1 : 1);
  });
}
