// Server-side hit detection. Everything here is authoritative.
import { WEAPONS, MAX_DEPTH, EYE, BODY_H } from '../shared/config.js';
import { groundAt } from '../shared/terrain.js';

const rnd = () => Math.random() * 2 - 1;

// march one bullet ray; returns where it stopped and whether it hit `other`
function castShot(T, shooter, a, pch, other) {
  const r = { a, p: pch, dist: MAX_DEPTH, hit: false, head: false };
  const eye = shooter.z + EYE, cos = Math.cos(a), sin = Math.sin(a), step = 0.04;
  for (let d = step; d < MAX_DEPTH; d += step) {
    const rx = shooter.x + cos * d, ry = shooter.y + sin * d, rz = eye + pch * d;
    if (rz < groundAt(T, rx, ry)) { r.dist = d; return r; }
    if (other && Math.hypot(rx - other.x, ry - other.y) < 0.32 && rz >= other.z && rz <= other.z + BODY_H + 0.05) {
      r.dist = d; r.hit = true;
      r.head = rz >= other.z + BODY_H - 0.2;
      return r;
    }
  }
  return r;
}

// returns { rays, dmg, head, backstab, hitRay }
export function doShoot(T, shooter, other, weapon, scoped) {
  const w = WEAPONS[weapon];
  const airborne = shooter.z - groundAt(T, shooter.x, shooter.y) > 0.05;
  const spread = w.pellets ? w.spread : airborne ? w.airSpread : scoped ? w.scopedSpread : w.spread;
  const res = { rays: [], dmg: 0, head: false, backstab: false, hitRay: null };
  for (let i = 0; i < (w.pellets || 1); i++) {
    const r = castShot(T, shooter, shooter.a + rnd() * spread, shooter.p + rnd() * spread, other);
    res.rays.push(r);
    if (!r.hit) continue;
    let d = w.dmg * (r.head ? w.head : 1);
    if (w.falloff) d *= Math.max(0.3, 1 - r.dist / w.falloff);
    res.dmg += d;
    res.head = res.head || r.head;
    res.hitRay = res.hitRay || r;
  }
  res.dmg = Math.round(res.dmg);
  return res;
}

export function doMelee(T, p, other) {
  const w = WEAPONS.blade;
  const ray = { a: p.a, p: p.p, dist: w.range, hit: false, head: false };
  const res = { rays: [ray], dmg: 0, head: false, backstab: false, hitRay: null };
  if (!other) return res;
  const dx = other.x - p.x, dy = other.y - p.y, d = Math.hypot(dx, dy);
  if (d > w.range) return res;
  let da = Math.atan2(dy, dx) - p.a;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  if (Math.abs(da) > 0.8) return res;
  if (Math.abs(p.z + EYE - (other.z + BODY_H / 2)) > 1.0) return res;
  for (let t = 0.1; t < 1; t += 0.1) // blade can't go through walls
    if (groundAt(T, p.x + dx * t, p.y + dy * t) > p.z + EYE * 0.5 + (other.z - p.z) * t) return res;
  res.backstab = (Math.cos(other.a) * dx + Math.sin(other.a) * dy) / (d || 1) > 0.5;
  ray.hit = true; ray.dist = d; ray.a = Math.atan2(dy, dx);
  res.hitRay = ray;
  res.dmg = res.backstab ? w.backstab : w.dmg;
  return res;
}
