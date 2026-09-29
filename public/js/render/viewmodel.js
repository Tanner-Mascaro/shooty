// The first-person gun: small low-poly models built from boxes, rasterized with a depth buffer into
// a low-res pixel buffer (the same size as the world's) and scaled up, so it matches the pixel look.
// Gun space: x right, y up, z forward (meters), with the sight line on y = 0 and the rear sight at
// z = 0 — so aiming down sights just puts that origin on the view axis and the sights line up.
import { S } from '../state.js';
import { gunLook } from '/shared/config.js';
import { ctx, view, pk } from './canvas.js';

const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
let img = null, pix = null, zb = null;
function fitBuffer() {
  const RW = Math.min(480, Math.round(view.W / 2));
  const RH = Math.max(1, Math.round(RW * view.H / view.W));
  if (img && img.width === RW && img.height === RH) return;
  buf.width = RW; buf.height = RH;
  img = bctx.createImageData(RW, RH);
  pix = new Uint32Array(img.data.buffer);
  zb = new Float32Array(RW * RH);
  fitBuffer._RW = RW; fitBuffer._RH = RH;
}
const vmW = () => fitBuffer._RW || buf.width;
const vmH = () => fitBuffer._RH || buf.height;

const VM_FOV = 1.2, NEAR = 0.03; // the gun has its own field of view, so scoping doesn't warp it

import { modelFor, gunPalette, VARIANT_SCALE } from './gunModels.js';

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
  beam:     [0.1, -0.068, 0.22, -0.08, 0.16],
  wand:     [0.085, -0.06, 0.22, -0.1, 0.1],
  blade:    [0.11, -0.085, 0.24, -0.25, 0],
  claws:    [0.12, -0.09, 0.22, -0.15, 0.1],
};
const ADS_Z = { wand: 0.34, pistol: 0.34, deagle: 0.34, revolver: 0.34, rifle: 0.3, burst: 0.3, carbine: 0.3, smg: 0.3, uzi: 0.32, lmg: 0.28, crossbow: 0.32, beam: 0.34 };
const MUZZLE = {
  pistol: [0, -0.018, 0.2], deagle: [0, -0.02, 0.235], revolver: [0, -0.025, 0.28],
  rifle: [0, -0.037, 0.67], burst: [0, -0.032, 0.56], carbine: [0, -0.031, 0.52],
  smg: [0, -0.038, 0.37], uzi: [0, -0.03, 0.3], lmg: [0, -0.04, 0.62],
  shotgun: [0, -0.018, 0.62], sniper: [0, -0.047, 0.84], crossbow: [0, -0.012, 0.46], beam: [0, -0.0, 0.8], wand: [0, -0.018, 0.33],
};

// light comes from above and a little to the left; lit per face, in the gun's own frame
const LIGHT = { py: 1.25, ny: 0.45, px: 0.72, nx: 0.95, pz: 0.6, nz: 0.85 };

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
  const W = vmW(), H = vmH();
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
  const cx = vmW() / 2, cy = vmH() / 2;
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
  const W = vmW(), H = vmH(), ol = pk(8, 8, 10);
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
  const quickBlade = now < S.quickUntil;
  const held = S.clawsOnly ? 'claws' : quickBlade ? 'blade' : S.weapon, w = gunLook(held); // newer guns use a base gun's model
  const melee = w === 'blade' || w === 'claws';
  const canAds = !melee && ADS_Z[w] && S.scoped;
  ads += ((canAds ? 1 : 0) - ads) * Math.min(1, dt * 14);
  if (!ADS_Z[w] || melee) ads = 0;

  const hip = HIP[w] || HIP.blade, a = ads, loose = 1 - 0.8 * a;
  const moving = S.onGround ? Math.min(S.speed, 4) : 0;
  const bx = Math.sin(S.bobPhase) * moving * 0.004 * loose, by = -Math.abs(Math.cos(S.bobPhase)) * moving * 0.003 * loose;
  const r = !melee && S.reloading, reload = r ? Math.sin(Math.min(1, (now - r.start) / (r.until - r.start)) * Math.PI) : 0;
  const drawIn = Math.max(0, (S.switchUntil - now) / 350);
  const dip = Math.max(reload, drawIn);
  const kick = S.recoil * (w === 'sniper' || w === 'shotgun' ? 1 : 0.5);
  const swing = meleePose(now);

  const yaw = hip[3] * (1 - a) + S.swayX * 0.012 * loose + swing.yaw;
  const pitch = kick * (0.1 + 0.05 * a) - dip * 0.7 - S.swayY * 0.012 * loose + (melee ? 0.15 : 0) + swing.pitch;
  const roll = hip[4] * (1 - a) + dip * 0.5 * (reload ? 1 : 0) + (melee ? -0.35 : 0) + (S.slideDip || 0) * 0.3 + swing.roll;
  const t = {
    x: hip[0] * (1 - a) + bx + swing.x, y: hip[1] * (1 - a) + by - dip * 0.12 - (S.slideDip || 0) * 0.02 + swing.y,
    z: hip[2] + ((ADS_Z[w] || hip[2]) - hip[2]) * a - kick * 0.04 + swing.z,
    cr: Math.cos(roll), sr: Math.sin(roll), cp: Math.cos(pitch), sp: Math.sin(pitch), cy: Math.cos(yaw), sy: Math.sin(yaw),
  };
  const F = (vmW() / 2) / Math.tan(VM_FOV / 2);

  // accents glow in the gun's own color (same as its pickup), so you can tell what you're holding
  const pal = gunPalette(held, 0.8 + 0.2 * Math.sin(now / 250));
  if (w === 'claws') { pal.s = [220, 230, 240]; pal.d = [60, 90, 50]; pal.m = [80, 120, 64]; pal.l = [150, 170, 120]; } // a monster's arm
  const bp = now - S.fireT - 450;
  const offs = {
    slide: -Math.max(0, 1 - (now - S.fireT) / 90) * 0.03,
    pump: -Math.max(0, 1 - Math.abs(now - S.fireT - 450) / 200) * 0.06,
    bolt: w === 'sniper' && bp > 0 && bp < 400 ? -Math.sin(bp / 400 * Math.PI) * 0.05 : 0,
  };

  pix.fill(0); zb.fill(0);
  const model = modelFor(held);
  if (!model) return;
  const bb = drawModel(model, t, F, pal, offs);
  if (bb[0] > bb[1]) return;
  outline(bb);
  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, view.W, view.H);

  if (swing.trail > 0.05) drawSlashTrail(swing, w === 'claws');

  if (S.muzzle > 0 && !melee) {
    const mz = MUZZLE[w] || [0, 0, 0.3], [x, y, z] = xf([mz[0], mz[1], mz[2] * (VARIANT_SCALE[held] || 1)], t), sc = view.W / vmW();
    const px = (vmW() / 2 + x / z * F) * sc, py = (vmH() / 2 - y / z * F) * sc, u = Math.min(view.W, view.H * 1.6) / 100;
    const rad = (w === 'sniper' || w === 'shotgun' || w === 'beam' ? 11 : 6) * u * S.muzzle / 6, g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,230,160,0.95)'); g.addColorStop(0.35, 'rgba(255,170,60,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}

// wind-up → slash → recover; returns pose offsets + trail strength
const SWING_MS = 340;
function meleePose(now) {
  const sp = Math.min(1, (now - S.swingT) / SWING_MS);
  if (sp >= 1 || sp <= 0) return { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0, trail: 0 };
  if (sp < 0.2) {
    const e = (sp / 0.2) ** 2;
    return { yaw: 0.45 * e, pitch: -0.3 * e, roll: -0.55 * e, x: 0.05 * e, y: 0.03 * e, z: -0.05 * e, trail: 0 };
  }
  if (sp < 0.52) {
    const t = (sp - 0.2) / 0.32, e = t * t * (3 - 2 * t);
    return {
      yaw: 0.45 - 1.55 * e, pitch: -0.3 + 0.7 * e, roll: -0.55 + 1.85 * e,
      x: 0.05 - 0.26 * e, y: 0.03 - 0.08 * e, z: -0.05 + 0.2 * e,
      trail: Math.sin(t * Math.PI),
    };
  }
  const t = (sp - 0.52) / 0.48, e = 1 - (1 - t) ** 2;
  return {
    yaw: -1.1 * (1 - e), pitch: 0.4 * (1 - e), roll: 1.3 * (1 - e),
    x: -0.21 * (1 - e), y: -0.05 * (1 - e), z: 0.15 * (1 - e),
    trail: (1 - e) * 0.35,
  };
}

// bright arc that follows the slash so the attack reads clearly
function drawSlashTrail(swing, claws) {
  const cx = view.W * 0.62, cy = view.H * 0.55, r = Math.min(view.W, view.H) * 0.38;
  const a0 = -0.9 + swing.yaw * 0.35, a1 = a0 + 1.1 * swing.trail;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = claws ? `rgba(140,255,80,${0.55 * swing.trail})` : `rgba(220,240,255,${0.5 * swing.trail})`;
  ctx.lineWidth = claws ? 7 : 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = claws ? `rgba(200,255,120,${0.85 * swing.trail})` : `rgba(255,255,255,${0.75 * swing.trail})`;
  ctx.lineWidth = claws ? 2.5 : 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, a0 + 0.05, a1 - 0.02);
  ctx.stroke();
  ctx.restore();
}
