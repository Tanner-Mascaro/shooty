// Firing, melee, scoping and weapon switching. The server decides hits; this only sends
// requests and plays the local feedback (sound, recoil, screen punch) immediately.
import { WEAPONS, AMMO, WEAPON_ORDER } from '/shared/config.js';
import { S, owned } from './state.js';
import { send } from './net.js';
import { play } from './audio.js';

export function switchWeapon(w) {
  if (w === S.weapon || !owned(w)) return;
  S.weapon = w; S.scoped = false;
  S.switchUntil = performance.now() + 350;
  play('swap');
}

export function cycleWeapon(dir) {
  let i = WEAPON_ORDER.indexOf(S.weapon);
  for (let n = 0; n < WEAPON_ORDER.length; n++) {
    i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    if (owned(WEAPON_ORDER[i])) { switchWeapon(WEAPON_ORDER[i]); return; }
  }
}

export function toggleScope() {
  if (S.weapon !== 'sniper') return;
  if (!S.scoped && performance.now() < S.nextFire.sniper) return; // still chambering
  S.scoped = !S.scoped;
  play('scope', S.scoped);
}

// quick = F key: stab without switching away from your gun
export function melee(quick) {
  const now = performance.now();
  if (now < S.nextFire.blade) return;
  S.nextFire.blade = now + WEAPONS.blade.cd;
  S.swingT = now;
  if (quick && S.weapon !== 'blade') { S.quickUntil = now + 320; S.switchUntil = Math.max(S.switchUntil, now + 320); }
  S.scoped = false;
  send({ type: 'shoot', weapon: 'blade' });
  play('swing');
  const lunge = S.onGround ? 1.6 : 0.8; // lunge forward, stacks with bhop
  S.vx += Math.cos(S.me.a) * lunge; S.vy += Math.sin(S.me.a) * lunge;
}

// per-weapon feel when you fire
const KICK = {
  rifle:   { recoil: 0.35, punch: 0.03,  shake: 2 },
  smg:     { recoil: 0.25, punch: 0.015, shake: 1.5 },
  shotgun: { recoil: 1,    punch: 0.12,  shake: 9,  fovKick: 0.05 },
  sniper:  { recoil: 1,    punch: 0.28,  shake: 14, fovKick: 0.12 },
};

export function fire() {
  const w = S.weapon;
  if (w === 'blade') { melee(false); return; }
  const now = performance.now();
  if (now < S.switchUntil || now < S.nextFire[w]) return;
  S.nextFire[w] = now + WEAPONS[w].cd;
  const limited = AMMO[w] !== undefined;
  if (limited && !(S.inv[w] > 0)) { play('dry'); return; }
  if (limited) S.inv[w]--; // server confirms with an inv message
  send({ type: 'shoot', weapon: w, scoped: S.scoped });
  play(w);
  S.muzzle = 6; S.fireT = now;
  const k = KICK[w];
  S.recoil = k.recoil;
  S.punch = Math.max(S.punch, k.punch);
  S.shake = Math.max(S.shake, k.shake);
  if (k.fovKick) S.fovKick = k.fovKick;
  if (w === 'sniper') { S.scoped = false; setTimeout(() => play('bolt'), 450); }
  if (w === 'shotgun') setTimeout(() => play('pump'), 350);
}

// called every frame: auto weapons keep firing while the button is held
export function autoFire() {
  if (S.mouseHeld && S.started && WEAPONS[S.weapon].auto) fire();
}
