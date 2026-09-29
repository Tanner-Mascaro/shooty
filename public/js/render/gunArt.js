// Guns as pictures: each gun's 3D model (render/gunModels.js) seen from its right side, turned a
// little so the top shows, lit, and drawn into a small pixel canvas with a dark outline. Used for
// guns on the ground, in other players' hands and on the hotbar, so they all match the one in
// your own hands. Muzzle to the right; `flip` mirrors it (muzzle to the left).
import { modelFor, gunPalette } from './gunModels.js';

const PPM = 110;        // canvas pixels per meter of gun
const TILT = 0.38;      // how far we look down onto the top (radians about the barrel's axis)
const cache = new Map();

// a face is visible if it points at us; lit brighter on top, a touch darker underneath
const FACES = [
  [[1, 5, 7, 3], [1, 0, 0], 0.82],   // right side (+x)
  [[2, 3, 7, 6], [0, 1, 0], 1.18],   // top (+y)
];

export function gunArt(held, flip = false) {
  const key = held + (flip ? '|l' : '|r');
  if (cache.has(key)) return cache.get(key);
  const parts = modelFor(held);
  if (!parts) return null;
  const pal = gunPalette(held), c = Math.cos(TILT), s = Math.sin(TILT);
  // gun space -> picture: u along the barrel, v down the screen; depth toward the viewer (right, above)
  const proj = ([x, y, z]) => ({ u: z, v: -(y * c - x * s), d: x * c + y * s });
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const polys = [];
  for (const b of parts) {
    const k = i => [i & 1 ? b.x1 : b.x0, i & 2 ? b.y1 : b.y0, i & 4 ? b.z1 : b.z0];
    for (const [idx, n, shade] of FACES) {
      const pts = idx.map(i => proj(k(i)));
      for (const p of pts) { u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u); v0 = Math.min(v0, p.v); v1 = Math.max(v1, p.v); }
      const base = pal[b.c] || pal.m, lit = b.c === 'g' || b.c === 'x';
      const f = lit ? 1 : shade;
      polys.push({ pts, d: pts.reduce((a, p) => a + p.d, 0) / 4 + n[0] * 0.0001, col: base.map(v => Math.min(255, v * f)) });
    }
  }
  polys.sort((a, b) => a.d - b.d); // far first
  const pad = 2, W = Math.max(8, Math.ceil((u1 - u0) * PPM) + pad * 2), H = Math.max(6, Math.ceil((v1 - v0) * PPM) + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const X = u => flip ? W - (pad + (u - u0) * PPM) : pad + (u - u0) * PPM, Y = v => pad + (v - v0) * PPM;
  for (const p of polys) {
    g.fillStyle = `rgb(${p.col.map(Math.round).join(',')})`;
    g.beginPath();
    p.pts.forEach((q, i) => i ? g.lineTo(X(q.u), Y(q.v)) : g.moveTo(X(q.u), Y(q.v)));
    g.closePath(); g.fill();
  }
  // crisp pixels: no half-transparent edges, then a one-pixel dark outline
  const img = g.getImageData(0, 0, W, H), a = img.data, solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { solid[i] = a[i * 4 + 3] > 110 ? 1 : 0; a[i * 4 + 3] = solid[i] ? 255 : 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < H - 1 && solid[i + W])) a.set([10, 10, 12, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const art = { canvas, w: W / PPM, h: H / PPM };
  cache.set(key, art);
  return art;
}
