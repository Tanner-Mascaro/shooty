// Firing, melee, scoping, reloading and weapon switching. The server decides hits; this only sends
// requests and plays the local feedback (sound, recoil, screen punch) immediately. Rounds are
// counted here the same way the server counts them, so the ammo readout never waits on the network.
import { WEAPONS, WEAPON_ORDER } from '/shared/config.js';
import { S, owned, spare } from './state.js';
import { send } from './net.js';
import { play } from './audio.js';

export function switchWeapon(w) {
  if (w === S.weapon || !owned(w)) return;
  S.lastWeapon = S.weapon;
  S.weapon = w; S.scoped = false;
  S.reloading = null; // switching away cancels a reload
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

// back to the gun you had before this one
export function swapWeapon() {
  if (owned(S.lastWeapon) && S.lastWeapon !== S.weapon) switchWeapon(S.lastWeapon);
  else cycleWeapon(1);
}

export function reload() {
  const w = S.weapon, def = WEAPONS[w];
  if (def.melee || S.reloading || !(S.mag[w] < def.mag) || !(spare(w) > 0)) return;
  S.reloading = { w, start: performance.now(), until: performance.now() + def.reload };
  S.scoped = false; S.mouseHeld = false;
  play('magOut');
}

// called every frame: finish a reload, or start one when the mag runs dry
export function updateReload() {
  const now = performance.now(), r = S.reloading;
  if (r && now >= r.until) {
    const n = Math.min(WEAPONS[r.w].mag - S.mag[r.w], spare(r.w));
    S.mag[r.w] += n;
    if (r.w !== 'rifle') S.inv[r.w] -= n;
    S.reloading = null;
    send({ type: 'reload', weapon: r.w });
    play('magIn');
  }
  if (!S.reloading && S.started && S.mag[S.weapon] === 0 && now >= S.nextFire[S.weapon] && now >= S.switchUntil) reload();
}

export function toggleScope() {
  if (S.weapon !== 'sniper' || S.reloading) return;
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
  if (now < S.switchUntil || now < S.nextFire[w] || S.reloading) return;
  S.nextFire[w] = now + WEAPONS[w].cd;
  if (!(S.mag[w] > 0)) { play('dry'); reload(); return; }
  S.mag[w]--;
  if (w !== 'rifle' && !S.mag[w] && !spare(w)) { // last round: the empty gun is gone
    delete S.mag[w]; delete S.inv[w];
    setTimeout(() => { if (S.weapon === w) swapWeapon(); }, 400);
  }
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
  updateReload();
  if (S.mouseHeld && S.started && WEAPONS[S.weapon].auto) fire();
}
