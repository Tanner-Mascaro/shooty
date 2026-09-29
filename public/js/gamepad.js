// Game controllers (Xbox / PlayStation / anything with the "standard" layout), read every frame.
//   left stick: walk (analog)        right stick: look          RT: fire (hold)    LT: aim
//   A / ✕: jump (hold to bhop)       B / ○: slide (dash when infected)
//   X / □: reload                    Y / △: swap weapon         RB: melee          LB: potion
//   d-pad up / left / right: spells 1-3, d-pad down: build mode    View/Share: map    Menu/Options: settings
// Everything calls the same actions as the mouse and keys.
import { S } from './state.js';
import { settings, openSettings, settingsOpen, closeSettings } from './settings.js';
import { fire, melee, cycleWeapon, reload, aim, throwNade } from './weapons.js';
import { setBuildMode, placeRamp, castSlot } from './spells.js';
import { cycleSpectate } from './spectate.js';
import { dash } from './physics.js';
import { toggleMap } from './mapview.js';
import { toast } from './ui.js';

const DEAD = 0.16;           // stick deadzone
const LOOK_SPEED = 1100;     // "mouse pixels" per second at full tilt (scaled by your sensitivity setting)
let prev = [];

const axis = v => Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);
const hold = (action, down) => { S.keys[settings.keys[action]] = down; };

export function initGamepad() {
  addEventListener('gamepadconnected', e => toast(`Controller connected: ${e.gamepad.id.split('(')[0].trim() || 'gamepad'}`));
  addEventListener('gamepaddisconnected', () => { S.padMove = { x: 0, y: 0 }; toast('Controller disconnected'); });
}

// called once per frame from the main loop
export function updateGamepad(dt) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const gp = pads.find(p => p.mapping === 'standard') || pads[0];
  if (!gp) { S.padMove = { x: 0, y: 0 }; return; }
  const b = gp.buttons.map(x => x.pressed || x.value > 0.5), was = prev;
  const pressed = i => b[i] && !was[i], released = i => !b[i] && was[i];
  prev = b;

  // menus work anywhere
  if (pressed(9)) { if (settingsOpen()) closeSettings(); else openSettings(); }
  if (!S.started || !S.me) { S.padMove = { x: 0, y: 0 }; return; }
  if (pressed(8)) toggleMap();

  const lx = axis(gp.axes[0] || 0), ly = axis(gp.axes[1] || 0), rx = axis(gp.axes[2] || 0), ry = axis(gp.axes[3] || 0);
  S.padMove = { x: lx, y: -ly };
  // a curve on the look stick: fine aim near the middle, fast turns at the edge
  const curve = v => Math.sign(v) * v * v;
  S.mouseDX += curve(rx) * LOOK_SPEED * dt;
  S.mouseDY += curve(ry) * LOOK_SPEED * dt * 0.8;

  if (S.dead) { if (pressed(7) || pressed(0)) cycleSpectate(); return; }
  // fire (RT) and aim (LT) hold like the mouse buttons
  if (pressed(7)) { if (S.buildMode) placeRamp(); else { S.mouseHeld = true; fire(); } }
  if (released(7)) S.mouseHeld = false;
  if (pressed(6)) aim(true);
  if (released(6)) aim(false);
  if (pressed(0) || released(0)) hold('jump', b[0]);
  if (pressed(1) || released(1) || pressed(10) || released(10)) {
    const down = b[1] || b[10];
    hold('slide', down);
    if (down) { if (S.clawsOnly) dash(); else S.slideArmed = true; }
  }
  if (pressed(2)) reload();
  if (pressed(3)) { setBuildMode(false); cycleWeapon(1); }
  if (pressed(5) || pressed(11)) melee(true);
  if (pressed(4)) throwNade();
  if (pressed(12)) castSlot(0);
  if (pressed(14)) castSlot(1);
  if (pressed(15)) castSlot(2);
  if (pressed(13)) setBuildMode(!S.buildMode);
}
