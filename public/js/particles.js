// World-space particles: hit bursts and the ambient embers/sparks/fireflies around you.
import { groundAt } from '/shared/terrain.js';
import { S } from './state.js';

// kind: 'blood' (falls), 'spark' (bright, falls), 'fire' (rises); color: tint every particle
// (kill effects, spells), e.g. [80, 220, 110]
export function burst(x, y, z, n, kind, color) {
  const b = S.theme.blood, f = S.theme.fire;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = Math.random() * (kind === 'spark' ? 3 : 2.2), life = 0.4 + Math.random() * (kind === 'fire' ? 1.2 : 0.8);
    const v = 0.75 + Math.random() * 0.5;
    const col = color ? color.map(c => Math.min(255, c * v))
      : kind === 'blood' ? [b[0] * (0.8 + Math.random() * 0.4), b[1], b[2]] : kind === 'spark' ? [255, 170 + Math.random() * 80, 60] : [f[0], f[1] * (0.6 + Math.random() * 0.6), f[2]];
    S.particles.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * 2.5 + (kind === 'fire' ? 0.5 : 0),
      g: kind === 'fire' ? -1.5 : 7, life, max: life, col, size: kind === 'blood' ? 0.05 : 0.035, emit: kind !== 'blood' });
  }
}

// a kill effect (shared/progression.js KILL_EFFECTS) where the victim fell: plain ones are a
// colored burst, styled ones move their own way
const rnd = (a, b) => a + Math.random() * (b - a);
function puff(x, y, z, o) {
  const life = rnd(o.life[0], o.life[1]), a = Math.random() * Math.PI * 2, sp = rnd(0, o.speed);
  S.particles.push({ x: x + rnd(-o.spread, o.spread), y: y + rnd(-o.spread, o.spread), z: z + rnd(-0.1, 0.3),
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(o.vz[0], o.vz[1]), g: o.g, life, max: life,
    col: typeof o.col === 'function' ? o.col() : o.col, size: 0.04, emit: o.emit ?? true });
}
const HUES = [[255, 80, 80], [255, 170, 60], [255, 240, 80], [90, 230, 110], [80, 170, 255], [190, 110, 255]];
const STYLES = {
  petals: (x, y, z, c) => { for (let i = 0; i < 50; i++) puff(x, y, z + 0.5, { life: [1.5, 2.6], speed: 1.6, spread: 0.2, vz: [0.8, 2.2], g: 1.1, col: () => c.map(v => v * rnd(0.7, 1.1)), emit: false }); },
  bubbles: (x, y, z, c) => { for (let i = 0; i < 70; i++) puff(x, y, z, { life: [0.8, 1.8], speed: 0.8, spread: 0.3, vz: [0.6, 2.4], g: -0.8, col: () => Math.random() < 0.3 ? [240, 250, 255] : c }); },
  confetti: (x, y, z) => { for (let i = 0; i < 90; i++) puff(x, y, z + 0.4, { life: [1.2, 2.2], speed: 3, spread: 0.1, vz: [2, 5], g: 5, col: () => HUES[Math.floor(Math.random() * HUES.length)] }); },
  lightning: (x, y, z, c) => {
    for (let i = 0; i < 40; i++) { const h = rnd(0, 6); puff(x + rnd(-0.15, 0.15), y + rnd(-0.15, 0.15), z + h, { life: [0.15, 0.4], speed: 0.3, spread: 0.05, vz: [0, 0], g: 0, col: [255, 255, 255] }); }
    for (let i = 0; i < 50; i++) puff(x, y, z + 0.2, { life: [0.3, 0.7], speed: 4, spread: 0.1, vz: [0.5, 3], g: 7, col: c });
  },
  souls: (x, y, z, c) => { for (let i = 0; i < 45; i++) puff(x, y, z + 0.4, { life: [2, 3.4], speed: 0.25, spread: 0.18, vz: [0.8, 1.4], g: -0.1, col: () => c.map(v => v * rnd(0.8, 1.1)) }); },
  bats: (x, y, z, c) => { for (let i = 0; i < 60; i++) puff(x, y, z + 0.6, { life: [0.9, 1.6], speed: 4.5, spread: 0.15, vz: [1.5, 3.5], g: -0.5, col: c, emit: false }); },
  rainbow: (x, y, z) => { for (let i = 0; i < 120; i++) { const k = i % HUES.length; puff(x, y, z + 0.3, { life: [0.8, 1.8], speed: 1 + k * 0.5, spread: 0.05, vz: [1, 2.5], g: 2, col: HUES[k] }); } },
};
export function killEffect(x, y, z, color, style) {
  if (STYLES[style]) return STYLES[style](x, y, z, color);
  burst(x, y, z + 0.4, 60, 'fire', color); burst(x, y, z + 0.6, 30, 'spark', color);
}

// a glowing violet trail behind every potion in flight, so you can see them coming
export function potionTrails(dt) {
  for (const n of S.thrown) {
    if (Math.random() > 40 * dt) continue;
    const life = 0.35 + Math.random() * 0.3;
    S.particles.push({ x: n.x + (Math.random() - 0.5) * 0.1, y: n.y + (Math.random() - 0.5) * 0.1, z: n.z + (Math.random() - 0.5) * 0.1,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, vz: 0.2, g: 0,
      life, max: life, col: Math.random() < 0.5 ? [200, 120, 255] : [255, 180, 255], size: 0.05, emit: true });
  }
}

export function updateEmbers() {
  const me = S.me, c = S.theme.ambient;
  while (S.embers.length < 55) {
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 9;
    const life = 3 + Math.random() * 4;
    S.embers.push({ x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r, z: Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, vz: S.theme.ambientVz * (0.4 + Math.random() * 1.2),
      g: 0, life, max: life, col: [c[0], c[1] * (0.7 + Math.random() * 0.5), c[2]], size: 0.025, emit: true });
  }
}

// smoke and sparks rising out of nearby volcano / iceberg tops
export function volcanoPlumes(dt) {
  const ice = S.theme.id === 'ice';
  for (const v of S.T.props) {
    if (v.type !== 'volcano' || Math.hypot(v.x - S.me.x, v.y - S.me.y) > 28) continue;
    if (Math.random() < 10 * dt) { // spark / snow glitter
      const life = 1 + Math.random() * 1.5;
      S.particles.push({ x: v.x + (Math.random() - 0.5) * 0.4, y: v.y + (Math.random() - 0.5) * 0.4, z: v.top + 0.1,
        vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: 1.5 + Math.random() * 2, g: ice ? 2.5 : 1.2,
        life, max: life, col: ice ? [180, 210, 255] : [255, 120 + Math.random() * 100, 20], size: 0.04, emit: true });
    }
    if (Math.random() < 5 * dt) { // smoke / mist
      const life = 2.5 + Math.random() * 2;
      S.particles.push({ x: v.x + (Math.random() - 0.5) * 0.5, y: v.y + (Math.random() - 0.5) * 0.5, z: v.top + 0.2,
        vx: (Math.random() - 0.5) * 0.3 + 0.2, vy: (Math.random() - 0.5) * 0.3, vz: 0.6 + Math.random() * 0.5, g: -0.05,
        life, max: life, col: ice ? [160, 180, 200] : [70, 50, 48], size: 0.14, emit: false });
    }
  }
}

export function stepParticles(list, dt) {
  for (const p of list) {
    p.vz -= p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const gz = groundAt(S.T, p.x, p.y);
    if (p.z < gz) { p.z = gz; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }
    p.life -= dt;
  }
  return list.filter(p => p.life > 0);
}
