// 3D world into the low-res buffer: heightmap "voxel space" terrain, billboards, particles.
// Everything is depth-tested against view.zbuf. S.cam holds this frame's camera.
import { RES, BODY_H, MAX_DEPTH } from '/shared/config.js';
import { S } from '../state.js';
import { view, pk } from './canvas.js';
import { colors } from '../level.js';
import { PLAYER_SPRITES } from './sprites.js';
import { MAT } from '/shared/terrain.js';

const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const LED = [[60, 255, 120], [60, 160, 255], [255, 170, 40]]; // server rack status lights

// ray-march depths along each screen column, shared by every frame
const ZS = [];
for (let z = 0.05; z < MAX_DEPTH; z += 0.004 + z * 0.01) ZS.push(z);

export function drawTerrain(now) {
  const { eye, horizon, focal, tanH, fwdx, fwdy, rtx, rty } = S.cam;
  const { RW, RH, pix, zbuf, skyRow } = view;
  const { CR, CG, CB, EM } = colors;
  const me = S.me, th = S.theme, T = S.T;
  const t = now / 1000, robot = th.id === 'robot', witch = th.id === 'witch';

  // sky gradient by row (depends only on elevation above the horizon)
  const lo = th.skyLo, hi = th.skyHi;
  for (let y = 0; y < RH; y++) {
    const el = (horizon - y) / focal;
    if (el < 0) skyRow[y] = pk(th.fog[0], th.fog[1], th.fog[2]);
    else { const k = Math.min(1, Math.sqrt(el / 0.8)); skyRow[y] = pk(lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k); }
  }

  const TW = T.TW, TH = T.TH, hg = T.hgt, kd = T.kind, mt = T.mat, fr = th.fog[0], fg = th.fog[1], fb = th.fog[2];
  const wc = th.wall, bc = th.band, pulse = 0.7 + 0.3 * Math.sin(t * 3);
  const fogF = ZS.map(z => 1 - Math.exp(-z * th.fogK));

  for (let c = 0; c < RW; c++) {
    const camX = (2 * (c + 0.5) / RW - 1) * tanH, dx = fwdx + rtx * camX, dy = fwdy + rty * camX;
    let ybot = RH, prevI = -1;
    // march front to back; each sample fills the rows between its top and what's drawn so far
    for (let s = 0; s < ZS.length; s++) {
      const z = ZS[s], wx = me.x + dx * z, wy = me.y + dy * z;
      if (wx < 0 || wy < 0) break;
      const i = (wx * RES) | 0, j = (wy * RES) | 0;
      if (i >= TW || j >= TH) break;
      const k = j * TW + i, h = hg[k], sy = horizon - (h - eye) * focal / z;
      const xFace = i !== prevI; prevI = i;
      if (sy >= ybot) continue;
      const ytop = sy < 0 ? 0 : sy | 0, f = fogF[s], kind = kd[k], m = mt[k];
      if (m === MAT.RACK || m === MAT.CRATE) {
        // flat-sided props get textured faces; `along` is the position across the face
        const along = xFace ? wy : wx, sh = xFace ? 0.8 : 1;
        for (let y = ytop; y < ybot; y++) {
          const hh = eye + (horizon - y - 0.5) * z / focal;
          let r, g, b, ff = f;
          if (hh > h - 0.04) { r = CR[k]; g = CG[k]; b = CB[k]; }
          else if (m === MAT.RACK) {
            // server rack: 1U rows, drive bays and blinking status lights
            const row = Math.floor(hh / 0.1), fr1 = hh / 0.1 - row, q = Math.floor(along * 8), fq = along * 8 - q;
            r = 30 * sh; g = 33 * sh; b = 40 * sh;
            if (fr1 < 0.1) { r = 16; g = 17; b = 22; }
            else if (hh > 0.12 && hh < h - 0.12) {
              const hs = hash(row * 131 + q, q * 7 + (along * 0.5 | 0));
              if (fq > 0.12 && fq < 0.32 && fr1 > 0.35 && fr1 < 0.7 && hs > 0.4) {
                const led = LED[hs > 0.88 ? 2 : hs > 0.68 ? 1 : 0], on = Math.sin(t * (1.5 + hs * 9) + hs * 50) > -0.4;
                if (on) { r = led[0]; g = led[1]; b = led[2]; ff = f * 0.2; } else { r = led[0] * 0.2; g = led[1] * 0.2; b = led[2] * 0.2; }
              } else if (fq > 0.5 && fq < 0.92 && fr1 > 0.25 && fr1 < 0.8) { r = 46 * sh; g = 50 * sh; b = 60 * sh; }
            }
          } else {
            // crate: frame, planks and a diagonal brace
            const u = (along * 1.67) % 1, v = hh / h;
            const frame = hh < 0.05 || hh > h - 0.09 || u < 0.08 || u > 0.92 || Math.abs(u - v) < 0.07;
            const tone = frame ? 0.62 : (hh * 12 | 0) & 1 ? 0.92 : 1;
            r = CR[k] * tone * sh; g = CG[k] * tone * sh; b = CB[k] * tone * sh;
          }
          const idx = y * RW + c;
          pix[idx] = pk(r + (fr - r) * ff, g + (fg - g) * ff, b + (fb - b) * ff); zbuf[idx] = z;
        }
      } else if (m === MAT.WALL) {
        // wall faces are textured by world height (hell: rune bands; robot: panels + light strip; witch: moss + runes)
        const sh = xFace ? 0.75 : 1, seam = ((wx + wy) * (robot ? 1 : 2)) % 1 < 0.05 ? 0.6 : 1;
        for (let y = ytop; y < ybot; y++) {
          const hh = eye + (horizon - y - 0.5) * z / focal;
          let r, g, b, ff = f;
          if (hh > h - 0.05) { r = CR[k]; g = CG[k]; b = CB[k]; }
          else if (robot ? (hh > 0.9 && hh < 0.97) : witch ? (hh > 0.7 && hh < 0.78 && ((wx + wy) * 3) % 1 < 0.55) : (h - hh) % 0.9 < 0.06) {
            r = bc[0] * pulse; g = bc[1] * pulse; b = bc[2] * pulse; ff = f * 0.5;
          }
          else if (robot && (h - hh) % 0.4 < 0.03) { r = wc[0] * 0.5; g = wc[1] * 0.5; b = wc[2] * 0.5; }
          else if (witch && hh < 0.35 + 0.15 * Math.sin((wx + wy) * 5)) { const m = sh * seam; r = 30 * m; g = 62 * m; b = 26 * m; }
          else { const m = sh * seam; r = wc[0] * m; g = wc[1] * m; b = wc[2] * m; }
          const idx = y * RW + c;
          pix[idx] = pk(r + (fr - r) * ff, g + (fg - g) * ff, b + (fb - b) * ff); zbuf[idx] = z;
        }
      } else {
        let r, g, b, ff = f;
        if (kind === 2) { // animated pit surface
          const v = 0.5 + 0.5 * Math.sin(wx * 3.1 + t * 1.7) * Math.sin(wy * 2.7 - t * 1.3);
          if (robot) { r = 20 + v * 60; g = 200 + v * 55; b = 120 + v * 80; }
          else if (witch) { const bub = Math.sin(wx * 11 + t * 3) * Math.sin(wy * 9 - t * 2) > 0.9; r = bub ? 200 : 50 + v * 50; g = bub ? 255 : 150 + v * 90; b = bub ? 140 : 30 + v * 30; }
          else { r = 255; g = 60 + v * 130; b = 10 + v * 40; }
          ff = f * 0.4;
        } else if (EM[k] === 3) { // lava in a volcano crater / running down its side
          const v = 0.5 + 0.5 * Math.sin(wx * 4.1 + t * 2.3) * Math.sin(wy * 3.7 - t * 1.9);
          r = 255; g = 70 + v * 130; b = 10 + v * 30; ff = f * 0.3;
        } else { r = CR[k]; g = CG[k]; b = CB[k]; if (EM[k]) { ff = f * 0.5; g *= 0.8 + 0.2 * Math.sin(t * 2 + wx); } }
        const col = pk(r + (fr - r) * ff, g + (fg - g) * ff, b + (fb - b) * ff);
        for (let y = ytop; y < ybot; y++) { const idx = y * RW + c; pix[idx] = col; zbuf[idx] = z; }
      }
      ybot = ytop;
      if (ybot <= 0) break;
    }

    // sky with the level's moon / planet
    let md = me.a + Math.atan(camX) - th.orbA;
    md = Math.atan2(Math.sin(md), Math.cos(md));
    const R = th.orbR, oc = th.orb, og = th.orbGlow;
    for (let y = 0; y < ybot; y++) {
      const idx = y * RW + c;
      zbuf[idx] = 1e9;
      if (Math.abs(md) < R + 0.25) {
        const de = (horizon - y) / focal - th.orbE, d = Math.hypot(md, de);
        if (d < R) {
          const cr = robot ? 0.8 + 0.2 * Math.sin(de * 60) : 0.85 + 0.15 * Math.sin(md * 90) * Math.sin(y * 0.7);
          pix[idx] = pk(oc[0] * cr, oc[1] * cr, oc[2] * cr); continue;
        }
        if (d < R + 0.22) {
          const gl = (1 - (d - R) / 0.22) ** 2, s = skyRow[y];
          pix[idx] = pk((s & 255) + og[0] * gl, ((s >> 8) & 255) + og[1] * gl, ((s >> 16) & 255) + og[2] * gl); continue;
        }
      }
      pix[idx] = skyRow[y];
    }
  }
}

// billboard at (ex, ey) with its bottom at height ez; w/h are world size
export function drawSprite(ex, ey, ez, w, h, px, pal, emit, flash, glint) {
  const { eye, horizon, focal, fwdx, fwdy, rtx, rty } = S.cam;
  const { RW, RH, pix, zbuf } = view;
  const dx = ex - S.me.x, dy = ey - S.me.y, f = dx * fwdx + dy * fwdy;
  if (f < 0.15) return;
  const cx = RW / 2 + (dx * rtx + dy * rty) / f * focal, hw = w / 2 / f * focal;
  const y0 = horizon - (ez + h - eye) / f * focal, y1 = horizon - (ez - eye) / f * focal;
  const xa = Math.max(0, Math.floor(cx - hw)), xb = Math.min(RW - 1, Math.ceil(cx + hw));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(RH - 1, Math.ceil(y1));
  if (xa > xb || ya > yb) return;
  const fog = 1 - Math.exp(-f * S.theme.fogK), F = S.theme.fog;
  const cols = pal.map((c, i) => {
    if (!c) return 0;
    const em = emit.indexOf(i) >= 0, ff = em ? fog * 0.3 : fog, m = flash && !em ? 2.2 : 1, add = flash && !em ? 80 : 0;
    return pk(Math.min(255, c[0] * m) * (1 - ff) + F[0] * ff, Math.min(255, c[1] * m + add) * (1 - ff) + F[1] * ff, Math.min(255, c[2] * m + add) * (1 - ff) + F[2] * ff);
  });
  for (let x = xa; x <= xb; x++) {
    const u = (x + 0.5 - (cx - hw)) / (2 * hw);
    for (let y = ya; y <= yb; y++) {
      const idx = y * RW + x;
      if (zbuf[idx] <= f) continue;
      const p = px(u, (y + 0.5 - y0) / (y1 - y0), glint);
      if (!p) continue;
      pix[idx] = cols[p]; zbuf[idx] = f;
    }
  }
}

// another player (or a corpse: squashed tall, stretched wide) using the level's character;
// `tint` [r, g, b] recolors the body for teams
const tinted = {};
export function drawPlayer(x, y, z, hScale, wScale, flash, glint, tint) {
  const s = PLAYER_SPRITES[S.theme.sprite];
  let pal = s.pal;
  if (tint) {
    const key = S.theme.sprite + tint;
    pal = tinted[key] ??= s.pal.map((c, i) => c && (i === 1 || i === 2) ? c.map((v, j) => v * 0.35 + tint[j] * (i === 1 ? 0.65 : 0.4)) : c);
  }
  drawSprite(x, y, z, 0.6 * wScale, (BODY_H + 0.12) * hScale, s.px, pal, s.emit, flash, glint);
}

export function drawParticles(list) {
  const { eye, horizon, focal, fwdx, fwdy, rtx, rty } = S.cam;
  const { RW, RH, pix, zbuf } = view;
  const F = S.theme.fog, fogK = S.theme.fogK;
  for (const p of list) {
    const dx = p.x - S.me.x, dy = p.y - S.me.y, f = dx * fwdx + dy * fwdy;
    if (f < 0.1) continue;
    const sx = (RW / 2 + (dx * rtx + dy * rty) / f * focal) | 0, sy = (horizon - (p.z - eye) / f * focal) | 0;
    const size = Math.max(1, Math.min(4, (p.size / f * focal) | 0));
    const k = Math.min(1, p.life / p.max * 2), ff = (1 - Math.exp(-f * fogK)) * (p.emit ? 0.4 : 1);
    const col = pk((p.col[0] * k) * (1 - ff) + F[0] * ff, (p.col[1] * k) * (1 - ff) + F[1] * ff, (p.col[2] * k) * (1 - ff) + F[2] * ff);
    for (let y = sy; y < sy + size; y++) for (let x = sx; x < sx + size; x++) {
      if (x < 0 || y < 0 || x >= RW || y >= RH) continue;
      const idx = y * RW + x;
      if (zbuf[idx] > f) pix[idx] = col;
    }
  }
}

// world point -> full-res screen point (f = depth in front of the camera)
export function project(x, y, z) {
  const c = S.cam, dx = x - S.me.x, dy = y - S.me.y, f = dx * c.fwdx + dy * c.fwdy;
  return { f, x: (view.RW / 2 + (dx * c.rtx + dy * c.rty) / f * c.focal) * c.sc + c.ox,
    y: (c.horizon - (z - c.eye) / f * c.focal) * c.sc + c.oy };
}

// is a projected point hidden behind terrain?
export function occluded(p) {
  const c = S.cam, bx = ((p.x - c.ox) / c.sc) | 0, by = ((p.y - c.oy) / c.sc) | 0;
  if (bx < 0 || by < 0 || bx >= view.RW || by >= view.RH) return true;
  return view.zbuf[by * view.RW + bx] < p.f - 0.2;
}
