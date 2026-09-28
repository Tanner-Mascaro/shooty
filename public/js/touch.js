// Touch controls for phones and tablets, shown only in a match on a touch screen:
// - left thumb: a joystick that appears where you touch (analog walk, read in physics.js)
// - right side: drag to look; tap the hotbar to switch guns, throw a potion, build or cast
// - buttons: fire (hold), aim, jump, slide, reload, swap, melee, potion, pick up, chat
// Everything calls the same actions as the mouse and keys, so the rules don't change.
import { S } from './state.js';
import { settings, toggleFullscreen } from './settings.js';
import { fire, melee, cycleWeapon, reload, aim, use, throwNade } from './weapons.js';
import { setBuildMode, placeRamp } from './spells.js';
import { cycleSpectate } from './spectate.js';
import { dash } from './physics.js';
import { openChat } from './chat.js';
import { initAudio } from './audio.js';

// ?touch=1 forces the touch controls on (for trying them on a computer)
export const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches
  || new URLSearchParams(location.search).has('touch');

const LOOK = 1.6;   // look drag: screen pixels -> "mouse" pixels
const STICK_R = 56; // how far the joystick knob travels
const BUTTONS = [
  // [action, label, class]
  ['fire', 'FIRE', 'big ruby'], ['jump', 'JUMP', 'emerald'], ['aim', 'AIM', 'sapphire'],
  ['reload', 'RELOAD', 'topaz'], ['swap', 'SWAP', 'topaz'], ['melee', 'MELEE', 'topaz'],
  ['nade', 'POTION', 'amethyst'], ['use', 'PICK UP', 'amethyst'], ['slide', 'SLIDE', 'amethyst'], ['chat', 'CHAT', 'topaz small'],
];

let stick = null, look = null, fullscreenAsked = false;

const hold = (action, down) => { S.keys[settings.keys[action]] = down; };

function press(action, down) {
  if (!S.started || !S.me) return;
  if (action === 'fire') {
    if (!down) { S.mouseHeld = false; return; }
    if (S.dead) return cycleSpectate();
    if (S.buildMode) return placeRamp();
    S.mouseHeld = true; fire();
  } else if (action === 'aim') aim(down); // "toggle" and "hold" both work: a tap toggles
  else if (action === 'jump') hold('jump', down);
  else if (action === 'slide') {
    hold('slide', down);
    if (down) { if (S.clawsOnly) dash(); else S.slideArmed = true; }
  } else if (!down || S.dead) return;
  else if (action === 'reload') reload();
  else if (action === 'swap') { setBuildMode(false); cycleWeapon(1); }
  else if (action === 'melee') melee(true);
  else if (action === 'nade') throwNade();
  else if (action === 'use') use();
  else if (action === 'chat') openChat();
}

// a tap on the hotbar: which slot, if any (hud.js records where it drew each one)
function hotbarTap(x, y) {
  const hit = (S.hotbarHits || []).find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  if (!hit || S.dead) return !!hit;
  hit.act();
  return true;
}

function buildUI() {
  const ui = document.createElement('div');
  ui.id = 'touchUI';
  ui.innerHTML = '<div id="stickBase" hidden><div id="stickKnob"></div></div><div id="touchButtons"></div>';
  const row = ui.querySelector('#touchButtons');
  for (const [action, label, cls] of BUTTONS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tbtn ' + cls; b.dataset.t = action; b.textContent = label;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      b.classList.add('down'); press(action, true);
      try { b.setPointerCapture(e.pointerId); } catch {} // keep this finger's lift on the button
    });
    const up = e => { e.stopPropagation(); if (!b.classList.contains('down')) return; b.classList.remove('down'); press(action, false); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    row.append(b);
  }
  const rotate = document.createElement('div');
  rotate.id = 'rotateHint';
  rotate.innerHTML = '<b>Turn your phone sideways</b><small>The game plays in landscape</small>';
  document.body.append(ui, rotate);
  return ui;
}

export function initTouch() {
  if (!isTouch) return;
  S.touch = true;
  document.body.classList.add('touch');
  const ui = buildUI(), base = ui.querySelector('#stickBase'), knob = ui.querySelector('#stickKnob');

  ui.addEventListener('pointerdown', e => {
    if (!S.started) return;
    e.preventDefault();
    initAudio();
    // one go at fullscreen per match, from a real touch (browsers only allow it then)
    if (!fullscreenAsked && document.fullscreenEnabled && !document.fullscreenElement) { fullscreenAsked = true; toggleFullscreen(); }
    if (hotbarTap(e.clientX, e.clientY)) return;
    if (e.clientX < innerWidth * 0.42 && !stick) {
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      base.hidden = false;
      base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
      knob.style.transform = '';
    } else if (!look) {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (S.dead) cycleSpectate();
    }
    try { ui.setPointerCapture(e.pointerId); } catch {}
  });
  ui.addEventListener('pointermove', e => {
    if (stick && e.pointerId === stick.id) {
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, d / STICK_R);
      S.touchMove = m < 0.18 ? { x: 0, y: 0 } : { x: dx / STICK_R, y: -dy / STICK_R };
    } else if (look && e.pointerId === look.id) {
      S.mouseDX += (e.clientX - look.x) * LOOK;
      S.mouseDY += (e.clientY - look.y) * LOOK;
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const end = e => {
    if (stick && e.pointerId === stick.id) { stick = null; base.hidden = true; S.touchMove = { x: 0, y: 0 }; }
    if (look && e.pointerId === look.id) look = null;
  };
  ui.addEventListener('pointerup', end);
  ui.addEventListener('pointercancel', end);
}

// a new match: offer fullscreen again on the first touch, and let go of everything
export function resetTouch() {
  fullscreenAsked = false;
  stick = look = null;
  S.touchMove = { x: 0, y: 0 };
  const base = document.getElementById('stickBase');
  if (base) base.hidden = true;
}
