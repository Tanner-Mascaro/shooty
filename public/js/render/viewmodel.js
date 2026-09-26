// The first-person gun: small low-poly models built from boxes, rasterized with a depth buffer into
// a low-res pixel buffer (the same size as the world's) and scaled up, so it matches the pixel look.
// Gun space: x right, y up, z forward (meters), with the sight line on y = 0 and the rear sight at
// z = 0 — so aiming down sights just puts that origin on the view axis and the sights line up.
import { S } from '../state.js';
import { GUN_COLOR } from '../constants.js';
import { ctx, view, pk } from './canvas.js';

const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
let img = null, pix = null, zb = null;
function fitBuffer() {
  if (img && img.width === view.RW && img.height === view.RH) return;
  buf.width = view.RW; buf.height = view.RH;
  img = bctx.createImageData(view.RW, view.RH);
  pix = new Uint32Array(img.data.buffer);
  zb = new Float32Array(view.RW * view.RH);
}

const VM_FOV = 1.2, NEAR = 0.03; // the gun has its own field of view, so scoping doesn't warp it

// [x0, x1, y0, y1, z0, z1, color] — colors: d dark, m mid, l light metal, b black, w wood,
// s steel, g glowing accent, x lens. `anim` names a part that moves (slide, pump, bolt).
const box = (x0, x1, y0, y1, z0, z1, c, anim) => ({ x0, x1, y0, y1, z0, z1, c, anim });
const sym = (hw, y0, y1, z0, z1, c, anim) => box(-hw, hw, y0, y1, z0, z1, c, anim);
// a notched rear sight: two posts either side of the view axis on a base
const notch = (z, w = 0.009, gap = 0.0035) => [sym(w, -0.009, -0.004, z - 0.005, z + 0.005, 'b'),
  box(-w, -gap, -0.004, 0.0015, z - 0.003, z + 0.003, 'b'), box(gap, w, -0.004, 0.0015, z - 0.003, z + 0.003, 'b')];
// accent strips down both sides of a part
const strips = (x, y0, y1, z0, z1) => [box(x, x + 0.002, y0, y1, z0, z1, 'g'), box(-x - 0.002, -x, y0, y1, z0, z1, 'g')];

const MODELS = {
  pistol: [
    sym(0.014, -0.032, -0.004, -0.01, 0.19, 'm', 'slide'),            // slide
    ...notch(0.004, 0.008, 0.003).map(p => ({ ...p, anim: 'slide' })),
    sym(0.0025, -0.004, 0, 0.172, 0.182, 'l', 'slide'),               // front post
    ...strips(0.014, -0.022, -0.017, 0.03, 0.16).map(p => ({ ...p, anim: 'slide' })),
    sym(0.006, -0.024, -0.012, 0.19, 0.194, 'b', 'slide'),            // muzzle
    sym(0.013, -0.052, -0.032, 0.0, 0.18, 'd'),                       // frame
    sym(0.016, -0.1, -0.052, -0.03, 0.035, 'd'),                      // grip
    sym(0.016, -0.14, -0.1, -0.042, 0.022, 'd'),
    sym(0.0165, -0.135, -0.06, -0.043, -0.03, 'g'),                   // backstrap glow
    sym(0.003, -0.074, -0.068, 0.035, 0.085, 'b'),                    // trigger guard
    sym(0.003, -0.074, -0.052, 0.08, 0.086, 'b'),
    sym(0.003, -0.068, -0.054, 0.05, 0.056, 'l'),                     // trigger
  ],
  rifle: [
    sym(0.022, -0.08, -0.022, -0.4, -0.13, 'd'),                      // stock
    sym(0.023, -0.085, -0.075, -0.4, -0.2, 'b'),
    sym(0.014, -0.052, -0.026, -0.13, -0.07, 'b'),                    // buffer tube
    sym(0.025, -0.078, -0.015, -0.08, 0.15, 'm'),                     // receiver
    ...strips(0.025, -0.05, -0.044, -0.06, 0.12),
    sym(0.011, -0.015, -0.009, -0.06, 0.4, 'd'),                      // top rail
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => sym(0.012, -0.013, -0.008, 0.03 + i * 0.036, 0.042 + i * 0.036, 'b')),
    ...notch(0.004),
    sym(0.028, -0.07, -0.012, 0.15, 0.42, 'd'),                       // handguard
    ...strips(0.028, -0.045, -0.037, 0.17, 0.4),
    sym(0.012, -0.022, -0.012, 0.395, 0.425, 'b'),                    // front sight
    sym(0.0025, -0.012, 0, 0.405, 0.413, 'b'),
    sym(0.009, -0.046, -0.028, 0.42, 0.62, 'b'),                      // barrel
    sym(0.013, -0.05, -0.024, 0.6, 0.67, 'b'),                        // muzzle brake
    sym(0.013, -0.125, -0.078, 0.03, 0.1, 'd'),                       // curved mag, in two steps
    sym(0.013, -0.17, -0.125, 0.05, 0.118, 'd'),
    sym(0.016, -0.14, -0.078, -0.07, -0.025, 'd'),                    // grip
    sym(0.003, -0.1, -0.094, -0.025, 0.028, 'b'),                     // trigger guard
  ],
  smg: [
    sym(0.009, -0.034, -0.022, -0.22, -0.06, 'd'),                    // folded wire stock
    sym(0.024, -0.085, -0.02, -0.235, -0.215, 'd'),
    sym(0.024, -0.072, -0.01, -0.06, 0.2, 'm'),                       // receiver
    ...strips(0.024, -0.042, -0.035, -0.04, 0.18),
    ...notch(0.004),
    sym(0.012, -0.018, -0.01, 0.19, 0.215, 'b'),                      // hooded front sight
    sym(0.0025, -0.01, 0, 0.198, 0.206, 'b'),
    sym(0.019, -0.058, -0.02, 0.2, 0.3, 'd'),                         // barrel shroud
    sym(0.008, -0.046, -0.03, 0.3, 0.37, 'b'),                        // barrel
    sym(0.012, -0.21, -0.072, 0.07, 0.11, 'd'),                       // long straight mag
    sym(0.0125, -0.21, -0.2, 0.068, 0.112, 'g'),
    sym(0.015, -0.145, -0.072, -0.045, 0.0, 'd'),                     // grip
    sym(0.003, -0.1, -0.094, 0.0, 0.05, 'b'),
  ],
  shotgun: [
    sym(0.024, -0.1, -0.02, -0.42, -0.06, 'w'),                       // stock
    sym(0.025, -0.106, -0.1, -0.42, -0.2, 'b'),
    sym(0.028, -0.078, -0.012, -0.06, 0.16, 'm'),                     // receiver
    ...strips(0.028, -0.05, -0.042, -0.04, 0.14),
    sym(0.006, -0.012, -0.006, -0.04, 0.16, 'b'),                     // sight groove
    sym(0.012, -0.03, -0.006, 0.16, 0.62, 'b'),                       // barrel
    sym(0.011, -0.056, -0.032, 0.16, 0.56, 'b'),                      // mag tube
    sym(0.003, -0.006, 0, 0.6, 0.607, 'l'),                           // bead
    sym(0.025, -0.07, -0.022, 0.24, 0.4, 'w', 'pump'),                // pump
    ...[0, 1, 2, 3, 4].map(i => sym(0.0255, -0.066, -0.026, 0.26 + i * 0.03, 0.27 + i * 0.03, 'd', 'pump')),
    sym(0.016, -0.14, -0.078, -0.07, -0.025, 'w'),                    // grip
    sym(0.003, -0.1, -0.094, -0.025, 0.03, 'b'),
  ],
  sniper: [
    sym(0.024, -0.105, -0.03, -0.44, -0.06, 'd'),                     // stock
    sym(0.018, -0.03, -0.018, -0.36, -0.16, 'd'),                     // cheek rest
    sym(0.026, -0.08, -0.03, -0.06, 0.18, 'm'),                       // receiver
    ...strips(0.026, -0.058, -0.051, -0.04, 0.16),
    sym(0.008, -0.03, -0.014, 0.02, 0.04, 'b'), sym(0.008, -0.03, -0.014, 0.16, 0.18, 'b'), // scope rings
    sym(0.013, -0.013, 0.013, -0.02, 0.26, 'b'),                      // scope tube
    sym(0.02, -0.02, 0.02, -0.05, 0.02, 'd'),                         // eyepiece
    sym(0.024, -0.024, 0.024, 0.2, 0.28, 'd'),                        // objective bell
    sym(0.018, -0.018, 0.018, 0.28, 0.282, 'x'),                      // lens
    sym(0.026, -0.09, -0.036, 0.18, 0.45, 'd'),                       // fore-end
    sym(0.009, -0.056, -0.038, 0.45, 0.8, 'b'),                       // barrel
    sym(0.013, -0.06, -0.034, 0.78, 0.84, 'b'),                       // muzzle brake
    box(0.026, 0.06, -0.052, -0.042, 0.0, 0.014, 'l', 'bolt'),        // bolt handle
    box(0.056, 0.07, -0.058, -0.038, -0.004, 0.018, 'l', 'bolt'),
    sym(0.016, -0.115, -0.08, 0.06, 0.12, 'd'),                       // mag
    sym(0.016, -0.15, -0.08, -0.08, -0.03, 'd'),                      // grip
  ],
  blade: [
    sym(0.012, -0.02, 0.02, -0.08, 0.035, 'd'),                       // handle
    ...[0, 1, 2].map(i => sym(0.0125, -0.021, 0.021, -0.06 + i * 0.03, -0.05 + i * 0.03, 'b')),
    sym(0.014, -0.022, 0.022, -0.095, -0.08, 'l'),                    // pommel
    sym(0.032, -0.024, 0.024, 0.035, 0.047, 'l'),                     // guard
    sym(0.003, -0.02, 0.022, 0.047, 0.14, 's'),                       // blade
    sym(0.003, -0.01, 0.018, 0.14, 0.17, 's'),
    sym(0.0025, 0.0, 0.012, 0.17, 0.19, 's'),
    sym(0.0035, 0.014, 0.022, 0.06, 0.135, 'g'),                      // glowing spine
  ],
};
// variants reuse a close model; colors alone tell them apart
MODELS.deagle = MODELS.pistol;
MODELS.revolver = MODELS.pistol;
MODELS.burst = MODELS.rifle;
MODELS.carbine = MODELS.rifle;
MODELS.uzi = MODELS.smg;
MODELS.crossbow = MODELS.sniper;
MODELS.lmg = [
  ...MODELS.smg,
  sym(0.03, -0.09, -0.02, -0.08, 0.18, 'd'),                          // heavier receiver
  sym(0.014, -0.24, -0.09, 0.05, 0.12, 'd'),                          // box mag
  sym(0.0145, -0.24, -0.23, 0.048, 0.122, 'g'),
];

// where each gun sits: hip (x, y, z, yaw, cant) and aimed (z only: x = y = 0 lines the sights up)
const HIP = {
  pistol:   [0.08, -0.06, 0.24, -0.06, 0.12],
  deagle:   [0.085, -0.062, 0.24, -0.06, 0.12],
  revolver: [0.088, -0.064, 0.24, -0.06, 0.14],
  rifle:    [0.1, -0.068, 0.22, -0.08, 0.18],
  burst:    [0.1, -0.068, 0.22, -0.08, 0.18],
  carbine:  [0.098, -0.066, 0.22, -0.08, 0.16],
  smg:      [0.1, -0.066, 0.22, -0.08, 0.18],
  uzi:      [0.095, -0.062, 0.22, -0.07, 0.14],
  lmg:      [0.105, -0.07, 0.22, -0.08, 0.2],
  shotgun:  [0.1, -0.068, 0.22, -0.08, 0.18],
  sniper:   [0.1, -0.07, 0.23, -0.08, 0.18],
  crossbow: [0.1, -0.072, 0.23, -0.08, 0.16],
  blade:    [0.11, -0.085, 0.24, -0.25, 0],
};
const ADS_Z = { pistol: 0.34, deagle: 0.34, revolver: 0.34, rifle: 0.3, burst: 0.3, carbine: 0.3, smg: 0.3, uzi: 0.32, lmg: 0.28, crossbow: 0.32 };
const MUZZLE = {
  pistol: [0, -0.018, 0.2], deagle: [0, -0.018, 0.2], revolver: [0, -0.018, 0.2],
  rifle: [0, -0.037, 0.67], burst: [0, -0.037, 0.67], carbine: [0, -0.037, 0.62],
  smg: [0, -0.038, 0.37], uzi: [0, -0.036, 0.34], lmg: [0, -0.04, 0.37],
  shotgun: [0, -0.018, 0.62], sniper: [0, -0.047, 0.84], crossbow: [0, -0.04, 0.7],
};

// light comes from above and a little to the left; lit per face, in the gun's own frame
const LIGHT = { py: 1.25, ny: 0.45, px: 0.72, nx: 0.95, pz: 0.6, nz: 0.85 };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const METAL = { hell: ['#2a2022', '#4a383a', '#6e5656'], robot: ['#262b33', '#46505e', '#6c7888'], witch: ['#20241c', '#3a4232', '#5a6450'],
  haunt: ['#241f18', '#443c2e', '#665a44'], ice: ['#1e2834', '#3a4a5c', '#5c7088'], castle: ['#242018', '#40382c', '#5e5244'] };

let ads = 0, lastT = 0;
export const aimAmount = () => ads; // 0 at the hip .. 1 fully aimed

// rotate a gun-space point by roll, then pitch, then yaw, and move it into place
function xf(p, t) {
  let [x, y, z] = p;
  [x, y] = [x * t.cr + y * t.sr, -x * t.sr + y * t.cr];
  [y, z] = [y * t.cp + z * t.sp, -y * t.sp + z * t.cp];
  [x, z] = [x * t.cy + z * t.sy, -x * t.sy + z * t.cy];
  return [x + t.x, y + t.y, z + t.z];
}

function tri(a, b, c, col, bb) {
  const W = view.RW, H = view.RH;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  if (x0 > x1 || y0 > y1) return;
  bb[0] = Math.min(bb[0], x0); bb[1] = Math.max(bb[1], x1); bb[2] = Math.min(bb[2], y0); bb[3] = Math.max(bb[3], y1);
  const inv = 1 / area;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0])) * inv;
      const w1 = ((a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0])) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const iz = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * W + x;
      if (iz > zb[i]) { zb[i] = iz; pix[i] = col; }
    }
  }
}

// clip a camera-space polygon to z >= NEAR, project it and fill it
function face(pts, col, F, bb) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if (p[2] >= NEAR) out.push(p);
    if ((p[2] >= NEAR) !== (q[2] >= NEAR)) {
      const t = (NEAR - p[2]) / (q[2] - p[2]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, NEAR]);
    }
  }
  if (out.length < 3) return;
  const cx = view.RW / 2, cy = view.RH / 2;
  const s = out.map(([x, y, z]) => [cx + x / z * F, cy - y / z * F, 1 / z]);
  for (let i = 1; i < s.length - 1; i++) tri(s[0], s[i], s[i + 1], col, bb);
}

// the six faces of a box: corner indices (bit 0 = x1, 1 = y1, 2 = z1) and the outward normal
const FACES = [[[0, 2, 6, 4], 'nx', [-1, 0, 0]], [[1, 5, 7, 3], 'px', [1, 0, 0]], [[0, 4, 5, 1], 'ny', [0, -1, 0]],
  [[2, 3, 7, 6], 'py', [0, 1, 0]], [[0, 1, 3, 2], 'nz', [0, 0, -1]], [[4, 6, 7, 5], 'pz', [0, 0, 1]]];

function drawModel(parts, t, F, pal, offs) {
  const bb = [1e9, -1e9, 1e9, -1e9];
  for (const b of parts) {
    const dz = b.anim ? offs[b.anim] || 0 : 0;
    const corners = [];
    for (let k = 0; k < 8; k++) corners.push(xf([k & 1 ? b.x1 : b.x0, k & 2 ? b.y1 : b.y0, (k & 4 ? b.z1 : b.z0) + dz], t));
    const base = pal[b.c], lit = b.c === 'g' || b.c === 'x';
    for (const [idx, key, n] of FACES) {
      const q = idx.map(i => corners[i]);
      // back-face cull: the face's normal (rotated) must point toward the eye
      const o = xf([0, 0, 0], t), nn = xf(n, t);
      const nx = nn[0] - o[0], ny = nn[1] - o[1], nz = nn[2] - o[2];
      if (nx * q[0][0] + ny * q[0][1] + nz * q[0][2] >= 0) continue;
      const f = lit ? 1 : LIGHT[key];
      face(q, pk(base[0] * f, base[1] * f, base[2] * f), F, bb);
    }
  }
  return bb;
}

// a dark pixel outline around the silhouette, so the gun reads against any background
function outline(bb) {
  const W = view.RW, H = view.RH, ol = pk(8, 8, 10);
  for (let y = Math.max(0, bb[2] - 1); y <= Math.min(H - 1, bb[3] + 1); y++)
    for (let x = Math.max(0, bb[0] - 1); x <= Math.min(W - 1, bb[1] + 1); x++) {
      const i = y * W + x;
      if (zb[i] > 0) continue;
      if ((x > 0 && zb[i - 1] > 0) || (x < W - 1 && zb[i + 1] > 0) || (y > 0 && zb[i - W] > 0) || (y < H - 1 && zb[i + W] > 0)) pix[i] = ol;
    }
}

export function drawViewmodel(now) {
  fitBuffer();
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const showBlade = S.weapon === 'blade' || now < S.quickUntil, w = showBlade ? 'blade' : S.weapon;
  const canAds = !showBlade && ADS_Z[w] && S.scoped;
  ads += ((canAds ? 1 : 0) - ads) * Math.min(1, dt * 14);
  if (!ADS_Z[w] || showBlade) ads = 0;

  const hip = HIP[w], a = ads, loose = 1 - 0.8 * a;
  const moving = S.onGround ? Math.min(S.speed, 4) : 0;
  const bx = Math.sin(S.bobPhase) * moving * 0.004 * loose, by = -Math.abs(Math.cos(S.bobPhase)) * moving * 0.003 * loose;
  const r = !showBlade && S.reloading, reload = r ? Math.sin(Math.min(1, (now - r.start) / (r.until - r.start)) * Math.PI) : 0;
  const drawIn = Math.max(0, (S.switchUntil - now) / 350);
  const dip = Math.max(reload, drawIn);
  const kick = S.recoil * (w === 'sniper' || w === 'shotgun' ? 1 : 0.5);
  // a stab: the knife lunges forward and across
  const sp = Math.min(1, (now - S.swingT) / 250), sw = showBlade && sp < 1 ? Math.sin(sp * Math.PI) : 0;

  const yaw = hip[3] * (1 - a) + S.swayX * 0.012 * loose - sw * 0.5;
  const pitch = kick * (0.1 + 0.05 * a) - dip * 0.7 - S.swayY * 0.012 * loose + (w === 'blade' ? 0.2 * (1 - sw) : 0);
  const roll = hip[4] * (1 - a) + dip * 0.5 * (reload ? 1 : 0) + (w === 'blade' ? -0.5 + sw * 0.6 : 0) + (S.slideDip || 0) * 0.3;
  const t = {
    x: hip[0] * (1 - a) + bx - sw * 0.08, y: hip[1] * (1 - a) + by - dip * 0.12 - (S.slideDip || 0) * 0.02 + sw * 0.03,
    z: hip[2] + ((ADS_Z[w] || hip[2]) - hip[2]) * a - kick * 0.04 + sw * 0.12,
    cr: Math.cos(roll), sr: Math.sin(roll), cp: Math.cos(pitch), sp: Math.sin(pitch), cy: Math.cos(yaw), sy: Math.sin(yaw),
  };
  const F = (view.RW / 2) / Math.tan(VM_FOV / 2);

  // accents glow in the gun's own color (same as its pickup), so you can tell what you're holding
  const m = METAL[S.theme.id] || METAL.hell, accent = GUN_COLOR[w] || S.theme.accent.split(',').map(Number), pulse = 0.8 + 0.2 * Math.sin(now / 250);
  const pal = { d: hex(m[0]), m: hex(m[1]), l: hex(m[2]), b: [22, 22, 26], w: [92, 60, 38], s: [170, 176, 186],
    g: accent.map(c => c * pulse), x: [110, 200, 255] };
  const bp = now - S.fireT - 450;
  const offs = {
    slide: -Math.max(0, 1 - (now - S.fireT) / 90) * 0.03,
    pump: -Math.max(0, 1 - Math.abs(now - S.fireT - 450) / 200) * 0.06,
    bolt: w === 'sniper' && bp > 0 && bp < 400 ? -Math.sin(bp / 400 * Math.PI) * 0.05 : 0,
  };

  pix.fill(0); zb.fill(0);
  const bb = drawModel(MODELS[w], t, F, pal, offs);
  if (bb[0] > bb[1]) return;
  outline(bb);
  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, view.W, view.H);

  if (S.muzzle > 0 && !showBlade) {
    const [x, y, z] = xf(MUZZLE[w], t), sc = view.W / view.RW;
    const px = (view.RW / 2 + x / z * F) * sc, py = (view.RH / 2 - y / z * F) * sc, u = Math.min(view.W, view.H * 1.6) / 100;
    const rad = (w === 'sniper' || w === 'shotgun' ? 11 : 6) * u * S.muzzle / 6, g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,230,160,0.95)'); g.addColorStop(0.35, 'rgba(255,170,60,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}
