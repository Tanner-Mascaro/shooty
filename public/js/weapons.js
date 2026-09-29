// Firing, melee, scoping, reloading and weapon switching. The server decides hits; this only sends
// requests and plays the local feedback (sound, recoil, screen punch) immediately. Rounds are
// counted here the same way the server counts them, so the ammo readout never waits on the network.
import { WEAPONS, GUN_SLOTS, USE_RANGE, HACK_FIRE, magSize, reloadTime, SURVIVAL, gunLook } from '/shared/config.js';
import { cryptLayout, isSurvivalLevel } from '/shared/crypt.js';
import { S, owned, spare, gunSlots } from './state.js';
import { send } from './net.js';
import { play } from './audio.js';
import { settings } from './settings.js';
import { ADS_ZOOM } from './constants.js';

export function switchWeapon(w) {
  if (w === S.weapon || !owned(w)) return;
  S.lastWeapon = S.weapon;
  S.weapon = w; S.scoped = false;
  S.reloading = null; // switching away cancels a reload
  S.switchUntil = performance.now() + 350;
  play('swap');
}

// slot n (1-based): your guns, then the blade last
export const slotWeapon = n => n > GUN_SLOTS ? 'blade' : gunSlots()[n - 1];
export function switchSlot(n) { const w = slotWeapon(n); if (w) switchWeapon(w); }

export function cycleWeapon(dir) {
  const order = [...gunSlots(), 'blade'];
  const i = order.indexOf(S.weapon);
  switchWeapon(order[(i + dir + order.length) % order.length]);
}

// back to the gun you had before this one
export function swapWeapon() {
  if (owned(S.lastWeapon) && S.lastWeapon !== S.weapon) switchWeapon(S.lastWeapon);
  else cycleWeapon(1);
}

export function throwNade() {
  if (!S.started || S.dead || S.clawsOnly || !(S.nades > 0) || performance.now() < S.switchUntil) return;
  if (!S.hacks) S.nades--;
  S.switchUntil = performance.now() + 400;
  send({ type: 'nade' });
  S.threwPotion = true; // for the tutorial
  play('swing');
}

export function reload() {
  if (S.clawsOnly || S.dead) return;
  const w = S.weapon, def = WEAPONS[w];
  if (def.melee || S.reloading || !(S.mag[w] < magSize(w, S.att)) || !(spare(w) > 0)) return;
  S.reloading = { w, start: performance.now(), until: performance.now() + reloadTime(w, S.att, S.elixirs?.quick) };
  S.scoped = false; S.mouseHeld = false;
  play('magOut');
}

// called every frame: finish a reload, or start one when the mag runs dry
export function updateReload() {
  if (S.clawsOnly) { S.reloading = null; return; }
  const now = performance.now(), r = S.reloading;
  if (r && now >= r.until) {
    const n = Math.min(magSize(r.w, S.att) - S.mag[r.w], spare(r.w));
    S.mag[r.w] += n;
    S.inv[r.w] -= n;
    S.reloading = null;
    send({ type: 'reload', weapon: r.w });
    play('magIn');
  }
  if (!S.reloading && S.started && S.mag[S.weapon] === 0 && now >= S.nextFire[S.weapon] && now >= S.switchUntil) reload();
}

// the sniper scopes in; the rifle, SMG and pistol aim down their iron sights (S.scoped covers both)
const scopeGun = () => gunLook(S.weapon) === 'sniper'; // sniper, marksman, dragon rifle
const aimable = () => !S.clawsOnly && (scopeGun() || ADS_ZOOM[gunLook(S.weapon)]) && !S.reloading;
const canScope = () => aimable() && (!scopeGun() || performance.now() >= (S.nextFire[S.weapon] || 0)); // not while chambering
const setScoped = on => { S.scoped = on; if (scopeGun()) play('scope', on); };

// right mouse button, pressed (down) or released; 'toggle' flips on press, 'hold' aims while held
export function aim(down) {
  S.aimHeld = !S.clawsOnly && down;
  if (settings.ads === 'hold') return; // updateScope does it
  if (!down || !aimable()) return;
  if (!S.scoped && !canScope()) return;
  setScoped(!S.scoped);
}

// hold mode, every frame: aimed exactly while the button is down and the gun is ready
// (so the sniper scopes back in by itself once the bolt is cycled after a shot)
function updateScope() {
  if (settings.ads !== 'hold') return;
  const want = S.aimHeld && (S.scoped ? aimable() : canScope());
  if (want !== S.scoped) setScoped(want);
}

// --- picking things up ---
// the nearest gun pad or loot box in reach, with what the use key would do there
export function findUseTarget() {
  if (S.clawsOnly) return null;
  const me = S.me;
  let best = null, bestD = USE_RANGE;
  const consider = (o, t) => {
    const d = Math.hypot(me.x - o.x, me.y - o.y);
    // roof heightmaps can mark floor loot as ~3m up; treat that as ground-level for reach
    const oz = o.z || 0, floorZ = oz > me.z + 1.5 ? 0 : oz;
    if (d <= bestD && Math.abs(me.z - floorZ) < 1.2) { best = t; bestD = d; }
  };
  S.pickupSpots.forEach((p, i) => {
    if (!S.pickupActive[i] || p.crate || p.weapon === 'health' || p.weapon === 'ammo' || p.weapon === 'nade' || p.weapon === 'scroll') return;
    consider(p, { pad: i, items: [p.weapon] });
  });
  for (const b of S.boxes) consider(b, { box: b.id, items: b.items });
  // the Crypt: doors, guns on the walls, elixirs and the mystery cauldron, all for gold
  if (S.room?.mode === 'survival' && isSurvivalLevel(S.level)) {
    const L = cryptLayout(S.MAP);
    for (const d of L.doors) {
      if (S.openDoors.has(d.id)) continue;
      const dx = Math.max(d.x0 - me.x, 0, me.x - d.x1), dy = Math.max(d.y0 - me.y, 0, me.y - d.y1), dd = Math.hypot(dx, dy);
      if (dd <= 1.5 && dd < bestD + 0.5) { best = { door: d.id, shop: `Open the ${d.name}`, cost: d.cost, items: [] }; bestD = dd; }
    }
    const shop = (o, t, r = 1.4) => { const d = Math.hypot(me.x - o.x, me.y - o.y); if (d <= r && d < bestD + 0.3) { best = t; bestD = d; } };
    for (const b of L.buys) {
      const owned = S.mag[b.w] !== undefined;
      shop(b, { buy: b.id, shop: owned ? `Refill ${b.w.toUpperCase()} ammo` : `Buy ${b.w.toUpperCase()}`, cost: owned ? Math.ceil(b.cost * SURVIVAL.refillShare) : b.cost, items: [b.w] });
    }
    for (const e of L.elixirs) if (!S.elixirs?.[e.elixir]) shop(e, { elixir: e.id, shop: `Drink ${e.name}`, cost: e.cost, items: [] });
    for (const c of L.boxes) shop(c, { cauldron: c.id, shop: 'Stir the mystery cauldron', cost: SURVIVAL.boxCost, items: [] }, 1.6);
  }
  return best;
}

// the gun that gets swapped out when both slots are full: the one in your hand, or the last one you held
export function gunToDrop() {
  const guns = gunSlots();
  if (guns.length < GUN_SLOTS) return null;
  return guns.includes(S.weapon) ? S.weapon : guns.includes(S.lastWeapon) ? S.lastWeapon : guns[0];
}

export function use() {
  const t = S.useTarget;
  if (S.clawsOnly || S.dead || !t) return;
  if (t.shop) {
    if (S.gold < t.cost) { play('dry'); return; }
    const key = ['door', 'buy', 'elixir', 'cauldron'].find(k => t[k] !== undefined);
    send({ type: 'use', [key]: t[key], drop: gunToDrop() });
    return;
  }
  send(t.pad !== undefined ? { type: 'use', pad: t.pad, drop: gunToDrop() } : { type: 'use', box: t.box, drop: gunToDrop() });
}

// quick = F key: stab without switching away from your gun
export function melee(quick) {
  if (!S.started || !S.me || S.dead) return;
  const weapon = S.clawsOnly ? 'claws' : 'blade';
  const now = performance.now();
  if (now < S.nextFire[weapon]) return;
  S.nextFire[weapon] = now + WEAPONS[weapon].cd * (S.hacks ? HACK_FIRE : 1);
  S.swingT = now;
  if (!S.clawsOnly && quick && S.weapon !== 'blade') { S.quickUntil = now + 360; S.switchUntil = Math.max(S.switchUntil, now + 360); }
  S.scoped = false;
  S.punch = Math.max(S.punch, S.clawsOnly ? 0.08 : 0.05);
  S.shake = Math.max(S.shake, S.clawsOnly ? 4 : 2.5);
  send({ type: 'shoot', weapon });
  play('swing');
  if (S.clawsOnly) return;
  const lunge = S.onGround ? 1.6 : 0.8; // lunge forward, stacks with bhop
  S.vx += Math.cos(S.me.a) * lunge; S.vy += Math.sin(S.me.a) * lunge;
}

// per-weapon feel when you fire
const KICK = {
  pistol:   { recoil: 0.5,  punch: 0.04,  shake: 2.5 },
  deagle:   { recoil: 0.85, punch: 0.1,   shake: 6 },
  revolver: { recoil: 1.0,  punch: 0.12,  shake: 7 },
  rifle:    { recoil: 0.35, punch: 0.03,  shake: 2 },
  burst:    { recoil: 0.45, punch: 0.04,  shake: 3 },
  carbine:  { recoil: 0.38, punch: 0.032, shake: 2.2 },
  smg:      { recoil: 0.25, punch: 0.015, shake: 1.5 },
  uzi:      { recoil: 0.22, punch: 0.012, shake: 1.2 },
  lmg:      { recoil: 0.4,  punch: 0.035, shake: 3 },
  shotgun:  { recoil: 1,    punch: 0.12,  shake: 9,  fovKick: 0.05 },
  sniper:   { recoil: 1,    punch: 0.28,  shake: 14, fovKick: 0.12 },
  crossbow: { recoil: 0.7,  punch: 0.08,  shake: 4 },
  beam:     { recoil: 0.35, punch: 0.04,  shake: 3, fovKick: 0.02 },
  wand:     { recoil: 0.3,  punch: 0.03,  shake: 2 },
};

export function fire() {
  if (!S.started || !S.me || S.dead || S.buildMode) return;
  const w = S.weapon;
  if (S.clawsOnly || w === 'blade') { melee(false); return; }
  const now = performance.now();
  if (now < S.switchUntil || now < S.nextFire[w] || S.reloading) return;
  S.nextFire[w] = now + WEAPONS[w].cd * (S.hacks ? HACK_FIRE : 1);
  if (!(S.mag[w] > 0)) { play('dry'); reload(); return; }
  const infinite = S.custom?.ammo === 'infinite' && !['survival', 'chamber'].includes(S.room?.mode);
  if (!S.hacks && !infinite) {
    S.mag[w]--;
    if (!S.mag[w] && !spare(w)) { // last round: the empty gun is gone
      delete S.mag[w]; delete S.inv[w];
      setTimeout(() => { if (S.weapon === w) swapWeapon(); }, 400);
    }
  }
  S.invisUntil = 0; // shooting gives you away (the server ends it too)
  // include look angles so the server aims where the crosshair is (recoil punch included)
  send({ type: 'shoot', weapon: w, scoped: S.scoped, a: S.me.a, p: S.pitch + (S.punch || 0) });
  play({ revolver: 'deagle', burst: 'rifle', carbine: 'rifle', lmg: 'smg', uzi: 'smg', crossbow: 'bolt', wand: 'beam' }[gunLook(w)] || gunLook(w));
  S.muzzle = 6; S.fireT = now;
  const k = KICK[w] || KICK[gunLook(w)] || KICK.pistol;
  S.recoil = k.recoil;
  S.punch = Math.max(S.punch, k.punch);
  S.shake = Math.max(S.shake, k.shake);
  if (k.fovKick) S.fovKick = k.fovKick;
  if (gunLook(w) === 'sniper') { S.scoped = false; setTimeout(() => play('bolt'), 450); }
  if (gunLook(w) === 'shotgun') setTimeout(() => play('pump'), 350);
}

// called every frame: auto weapons keep firing while the button is held
export function autoFire() {
  updateReload();
  updateScope();
  S.useTarget = S.started && S.me && !S.dead ? findUseTarget() : null;
  if (S.mouseHeld && S.started && (S.clawsOnly || WEAPONS[S.weapon].auto)) fire();
}
