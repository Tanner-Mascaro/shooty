// World-space particles: hit bursts and the ambient embers/sparks/fireflies around you.
import { groundAt } from '/shared/terrain.js';
import { S } from './state.js';

// kind: 'blood' (falls), 'spark' (bright, falls), 'fire' (rises)
export function burst(x, y, z, n, kind) {
  const b = S.theme.blood, f = S.theme.fire;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = Math.random() * (kind === 'spark' ? 3 : 2.2), life = 0.4 + Math.random() * (kind === 'fire' ? 1.2 : 0.8);
    const col = kind === 'blood' ? [b[0] * (0.8 + Math.random() * 0.4), b[1], b[2]] : kind === 'spark' ? [255, 170 + Math.random() * 80, 60] : [f[0], f[1] * (0.6 + Math.random() * 0.6), f[2]];
    S.particles.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * 2.5 + (kind === 'fire' ? 0.5 : 0),
      g: kind === 'fire' ? -1.5 : 7, life, max: life, col, size: kind === 'blood' ? 0.05 : 0.035, emit: kind !== 'blood' });
  }
}

export function updateEmbers() {
  const me = S.me, c = S.theme.ambient;
  while (S.embers.length < 110) {
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 9;
    const life = 3 + Math.random() * 4;
    S.embers.push({ x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r, z: Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, vz: S.theme.ambientVz * (0.4 + Math.random() * 1.2),
      g: 0, life, max: life, col: [c[0], c[1] * (0.7 + Math.random() * 0.5), c[2]], size: 0.025, emit: true });
  }
}

// smoke and sparks rising out of nearby volcano craters (hell)
export function volcanoPlumes(dt) {
  for (const v of S.T.props) {
    if (v.type !== 'volcano' || Math.hypot(v.x - S.me.x, v.y - S.me.y) > 28) continue;
    if (Math.random() < 10 * dt) { // spark
      const life = 1 + Math.random() * 1.5;
      S.particles.push({ x: v.x + (Math.random() - 0.5) * 0.4, y: v.y + (Math.random() - 0.5) * 0.4, z: v.top + 0.1,
        vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: 1.5 + Math.random() * 2, g: 1.2,
        life, max: life, col: [255, 120 + Math.random() * 100, 20], size: 0.04, emit: true });
    }
    if (Math.random() < 5 * dt) { // smoke
      const life = 2.5 + Math.random() * 2;
      S.particles.push({ x: v.x + (Math.random() - 0.5) * 0.5, y: v.y + (Math.random() - 0.5) * 0.5, z: v.top + 0.2,
        vx: (Math.random() - 0.5) * 0.3 + 0.2, vy: (Math.random() - 0.5) * 0.3, vz: 0.6 + Math.random() * 0.5, g: -0.05,
        life, max: life, col: [70, 50, 48], size: 0.14, emit: false });
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
