// Server-side hit detection. Everything here is authoritative.
// `targets` is every player the shooter can hurt (no teammates).
import { WEAPONS, MAX_DEPTH, EYE, BODY_H, SLIDE } from '../shared/config.js';
import { groundAt } from '../shared/terrain.js';

const rnd = () => Math.random() * 2 - 1;

// march one bullet ray; returns where it stopped and who it hit (the first body in the way)
function castShot(T, shooter, a, pch, targets) {
  const r = { a, p: pch, dist: MAX_DEPTH, hit: null, head: false };
  const eye = shooter.z + EYE - (shooter.sl ? SLIDE.drop : 0), cos = Math.cos(a), sin = Math.sin(a), step = 0.04;
  for (let d = step; d < MAX_DEPTH; d += step) {
    const rx = shooter.x + cos * d, ry = shooter.y + sin * d, rz = eye + pch * d;
    if (rz < groundAt(T, rx, ry)) { r.dist = d; return r; }
    for (const o of targets) {
      const h = o.h || (o.sl ? BODY_H * SLIDE.crouch : BODY_H); // creatures are taller, sliding players lower
      if (Math.hypot(rx - o.x, ry - o.y) < 0.32 && rz >= o.z && rz <= o.z + h + 0.05) {
        r.dist = d; r.hit = o;
        r.head = rz >= o.z + h - 0.2;
        return r;
      }
    }
  }
  return r;
}

// returns { rays, hits: [{ target, dmg, head, ray }] } — one entry per target hit
// (a shotgun blast can hit several people)
export function doShoot(T, shooter, targets, weapon, scoped) {
  const w = WEAPONS[weapon];
  const airborne = shooter.z - groundAt(T, shooter.x, shooter.y) > 0.05;
  const spread = w.pellets ? w.spread : airborne ? w.airSpread : scoped ? w.scopedSpread : w.spread;
  const rays = [], byTarget = new Map();
  for (let i = 0; i < (w.pellets || 1); i++) {
    const r = castShot(T, shooter, shooter.a + rnd() * spread, shooter.p + rnd() * spread, targets);
    rays.push(r);
    if (!r.hit) continue;
    let d = w.dmg * (r.head ? w.head : 1);
    if (w.falloff) d *= Math.max(0.3, 1 - r.dist / w.falloff);
    const h = byTarget.get(r.hit) || byTarget.set(r.hit, { target: r.hit, dmg: 0, head: false, ray: r }).get(r.hit);
    h.dmg += d; h.head = h.head || r.head;
  }
  const hits = [...byTarget.values()];
  hits.forEach(h => h.dmg = Math.round(h.dmg));
  return { rays, hits };
}

// stabs the nearest target in front of you; same result shape as doShoot
export function doMelee(T, p, targets) {
  const w = WEAPONS.blade;
  const ray = { a: p.a, p: p.p, dist: w.range, hit: null, head: false };
  let best = null;
  for (const o of targets) {
    const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
    if (d > w.range || (best && d >= best.d)) continue;
    let da = Math.atan2(dy, dx) - p.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.8) continue;
    if (Math.abs(p.z + EYE - (o.z + BODY_H / 2)) > 1.0) continue;
    let blocked = false; // blade can't go through walls
    for (let t = 0.1; t < 1; t += 0.1)
      if (groundAt(T, p.x + dx * t, p.y + dy * t) > p.z + EYE * 0.5 + (o.z - p.z) * t) { blocked = true; break; }
    if (!blocked) best = { o, d, dx, dy };
  }
  if (!best) return { rays: [ray], hits: [] };
  const { o, d, dx, dy } = best;
  const backstab = (Math.cos(o.a) * dx + Math.sin(o.a) * dy) / (d || 1) > 0.5;
  ray.hit = o; ray.dist = d; ray.a = Math.atan2(dy, dx);
  return { rays: [ray], hits: [{ target: o, dmg: backstab ? w.backstab : w.dmg, head: false, backstab, ray }] };
}
