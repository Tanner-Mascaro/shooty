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
import { cycleSpectate } from './spectate.js';
import { setBuildMode, placeRamp, castSlot } from './spells.js';
import { toggleMap } from './mapview.js';
import { EMOTES } from '/shared/config.js';

// the emote wheel: open with its key, then a number key, or move the mouse toward one and click
function emote(e) {
  S.emoteWheel = false;
  if (e) send({ type: 'emote', emote: e });
}
function wheelPick() {
  const { x, y } = S.wheelAim || { x: 0, y: 0 };
  if (Math.hypot(x, y) < 25) return null;
  const a = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return EMOTES[Math.round(a / (Math.PI * 2) * EMOTES.length) % EMOTES.length];
}

const locked = () => document.pointerLockElement === canvas;
const typing = e => e.target.matches('input:not([type]), input[type=text], input[type=password], textarea') || chatOpen();

export function initInput() {
  canvas.addEventListener('click', () => {
    if (!S.started || chatOpen() || S.touch) return; // touch screens aim by dragging (touch.js), no mouse lock
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
    if (S.emoteWheel) { // picking an emote: number keys choose, anything else closes it
      const n = /^Digit([1-8])$/.exec(e.code);
      if (n) { e.preventDefault(); return emote(EMOTES[+n[1] - 1]); }
      if (act === 'emote' || e.code === 'Escape') return emote(null);
    }
    if (act === 'emote' && S.started && !S.dead) { S.emoteWheel = true; S.wheelAim = { x: 0, y: 0 }; S.mouseHeld = false; return; }
    if (act === 'fullscreen') return toggleFullscreen();
    if (act === 'settings') return openSettings();
    if (act === 'map') return toggleMap();
    if (act === 'chat') { e.preventDefault(); return openChat(); }
    if (act === 'talk') askMic(); // first press asks for the mic
    if (act === 'slide' && !S.clawsOnly) S.slideArmed = true;
    if (!S.started || !act || S.dead) return;
    if (act.startsWith('slot') || act === 'swap') setBuildMode(false); // back to the gun
    if (act.startsWith('slot')) switchSlot(+act.slice(4));
    if (act === 'swap') swapWeapon();
    if (act === 'use') use();
    if (act === 'reload') reload();
    if (act === 'melee') melee(true);
    if (act === 'slide' && S.clawsOnly && locked()) dash();
    if (act === 'nade') throwNade();
    if (act === 'respawn') send({ type: 'respawn' });
    if (act === 'build') setBuildMode(!S.buildMode);
    if (act.startsWith('spell')) castSlot(+act.slice(5) - 1);
  });
  window.addEventListener('keyup', e => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; S.mouseHeld = false; }); // don't keep running after alt-tab

  document.addEventListener('mousemove', e => {
    if (!locked()) return;
    if (S.emoteWheel) { const w = S.wheelAim; w.x = Math.max(-120, Math.min(120, w.x + e.movementX)); w.y = Math.max(-120, Math.min(120, w.y + e.movementY)); S.wheelPick = wheelPick(); return; }
    S.mouseDX += e.movementX; S.mouseDY += e.movementY;
  });
  document.addEventListener('mousedown', e => {
    if (!S.started || !S.me || !locked()) return;
    if (S.emoteWheel) { emote(e.button === 0 ? wheelPick() : null); return; }
    if (e.button === 0 && S.dead) return cycleSpectate(); // dead: click watches someone else
    if (S.buildMode) { if (e.button === 0) placeRamp(); else if (e.button === 2) setBuildMode(false); return; }
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
    setBuildMode(false);
    cycleWeapon(e.deltaY < 0 ? -1 : 1);
  });
}
