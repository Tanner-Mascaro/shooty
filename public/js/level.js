// Loads a level: terrain, precomputed floor colors, minimap image and pickup pads.
import { RES } from '/shared/config.js';
import { LEVELS, MW, MH, inBackrooms } from '/shared/levels.js';
import { buildTerrain, findPickups, MAT, noise } from '/shared/terrain.js';
import { S } from './state.js';
import { THEMES } from './themes.js';
import { pk } from './render/canvas.js';
import { updateDrone } from './audio.js';
import { applyLevelUI } from './ui.js';
import { invalidateWorld } from './render/gl/scene.js';

// per heightmap sample: base color and emissive flag (kept for minimap / lobby previews)
export const colors = { CR: null, CG: null, CB: null, EM: null };
export const mini = document.createElement('canvas');

export function setLevel(name) {
  if (!LEVELS[name] || name === S.level) return;
  S.level = name; S.MAP = LEVELS[name]; S.theme = THEMES[name];
  S.T = buildTerrain(S.MAP, RES, name);
  S.builds.clear(); // conjured walls / ramps belonged to the old map
  S.doorPrev.clear(); S.openDoors = new Set(); // and so did the Crypt's doors
  buildColors(); buildMini();
  S.pickupSpots = findPickups(S.MAP);
  S.pickupActive = S.pickupSpots.map(() => true);
  S.embers = []; S.particles = []; S.corpses = []; S.tracers = [];
  invalidateWorld();
  applyLevelUI(name, S.theme);
  updateDrone();
}

const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function buildColors() {
  const { T, MAP, theme } = S, NT = T.TW * T.TH;
  const CR = colors.CR = new Uint8Array(NT), CG = colors.CG = new Uint8Array(NT), CB = colors.CB = new Uint8Array(NT), EM = colors.EM = new Uint8Array(NT);
  const isPit = (cx, cy) => cy >= 0 && cy < MH && cx >= 0 && cx < MW && MAP[cy][cx] === 'L';
  // shapes are lit from the side the level's moon / planet is on
  const lx = Math.cos(theme.orbA) * 0.6, ly = Math.sin(theme.orbA) * 0.6, lz = 0.8;
  const h = (i, j) => T.hgt[Math.min(T.TH - 1, Math.max(0, j)) * T.TW + Math.min(T.TW - 1, Math.max(0, i))];
  // how close a floor sample is to a wall (0 = flush, 1 = open); used for contact darkening
  const wallProx = (i, j) => {
    let best = 3;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= T.TW || jj >= T.TH) continue;
      if (T.kind[jj * T.TW + ii] === 1) best = Math.min(best, Math.hypot(di, dj));
    }
    return Math.min(1, best / 2.2);
  };
  for (let j = 0; j < T.TH; j++) for (let i = 0; i < T.TW; i++) {
    const k = j * T.TW + i, x = (i + 0.5) / RES, y = (j + 0.5) / RES, n = hash(i, j), m = T.mat[k];
    let r, g, b;
    if (m === MAT.FLOOR) {
      let ld = 99; // distance to the nearest pit; only nearby ones matter (the glow fades out by 1.5)
      const cx = Math.floor(x), cy = Math.floor(y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if (isPit(cx + dx, cy + dy)) ld = Math.min(ld, Math.max(0, Math.max(Math.abs(x - cx - dx - 0.5), Math.abs(y - cy - dy - 0.5)) - 0.5));
      const glow = Math.max(0, 1 - ld / 1.5) ** 2;
      [r, g, b] = FLOORS[theme.id](x, y, n, glow, ld, k, EM);
      // soft shadow where floor meets walls / props
      const ao = 0.62 + 0.38 * wallProx(i, j);
      r *= ao; g *= ao; b *= ao;
    } else if (m === MAT.PIT) { r = 255; g = 200; b = 50; EM[k] = 2; }
    else {
      [r, g, b] = SHAPE_COLORS[m](x, y, T.hgt[k], n, theme);
      if (m === MAT.LAVA) EM[k] = 3;
      else {
        // slope shading from the surface normal
        const dx = (h(i + 1, j) - h(i - 1, j)) * RES / 2, dy = (h(i, j + 1) - h(i, j - 1)) * RES / 2;
        const shade = 0.55 + 0.7 * Math.max(0, (-dx * lx - dy * ly + lz) / Math.hypot(dx, dy, 1));
        r *= shade; g *= shade; b *= shade;
      }
    }
    CR[k] = Math.min(255, r); CG[k] = Math.min(255, g); CB[k] = Math.min(255, b);
  }
}

// obstacle surface colors by material: (world x, y, height, noise 0..1, theme) -> [r, g, b]
const SHAPE_COLORS = {
  [MAT.ROCK](x, y, h, n, theme) {
    if (theme.id === 'crypt') { // weathered gravestones
      const v = 0.7 + 0.3 * noise(x * 6, y * 6) + n * 0.1, moss = noise(x * 9, y * 9) > 0.75;
      return moss ? [70 * v, 90 * v, 60 * v] : [120 * v, 118 * v, 112 * v];
    }
    if (theme.id === 'ice') { // packed ice and snow
      const mott = 0.75 + 0.35 * noise(x * 4, y * 4) + n * 0.08;
      const crack = Math.sin(h * 14 + noise(x, y) * 5) > 0.7 ? 0.78 : 1;
      return [170 * mott * crack, 200 * mott * crack, 230 * mott * crack];
    }
    // volcanic rock: ash mottling, darker strata, hot undertone near the rim
    const mott = 0.7 + 0.4 * noise(x * 4.2, y * 4.2) + n * 0.08;
    const band = Math.sin(h * 11 + noise(x, y) * 4) > 0.55 ? 0.68 : 1;
    const ash = noise(x * 9, y * 9) > 0.78 ? 1.18 : 1;
    const hot = Math.max(0, (h - 1.2) / 1.6) * 0.15;
    return [(118 + 40 * hot) * mott * band * ash, (54 + 10 * hot) * mott * band, 40 * mott * band];
  },
  [MAT.LAVA]() { return [255, 200, 50]; },
  [MAT.BARK](x, y, h, n) { // trunk tops: grain rings + darker pith
    const ring = 0.85 + 0.2 * Math.sin(h * 18 + noise(x * 3, y * 3) * 6), v = (0.75 + 0.35 * n) * ring;
    return [68 * v, 48 * v, 30 * v];
  },
  [MAT.ROOTS](x, y, h, n) { const v = 0.65 + 0.55 * noise(x * 7, y * 7); return [48 * v, 46 * v, 26 * v]; },
  [MAT.LEAVES](x, y, h, n) { // bushes and hedges: mottled greens with light speckles
    const v = 0.55 + 0.7 * noise(x * 5.5, y * 5.5);
    if (n > 0.92) return [100, 155, 70];
    if (noise(x * 8, y * 8) > 0.82) return [22 * v, 55 * v, 20 * v]; // deep shade pockets
    return [34 * v, 82 * v, 30 * v];
  },
  [MAT.WALL](x, y, h, n, theme) {
    const v = 0.8 + n * 0.25 + 0.1 * noise(x * 2, y * 2);
    if (theme.id === 'haunt' && !inBackrooms(x, y)) return [150 * v, 95 * v, 190 * v]; // the manor's hexed violet wallpaper
    return theme.wallTop.map(c => c * v);
  },
  [MAT.RACK](x, y) { // shelf tops: dark wood with a lip along the edge
    const lip = (x * 4) % 1 < 0.1 || (y * 4) % 1 < 0.1;
    return lip ? [52, 34, 24] : [86, 58, 40];
  },
  [MAT.PUMPKIN](x, y) { // ribbed orange (the 3D pumpkin is a prop; this is for the minimap)
    const rib = Math.sin(Math.atan2(y % 1 - 0.5, x % 1 - 0.5) * 8) > 0.6 ? 0.8 : 1;
    return [230 * rib, 110 * rib, 25 * rib];
  },
  [MAT.DOOR]() { return [110, 72, 40]; },
  [MAT.STONE]() { return [90, 110, 70]; },
  [MAT.CRATE](x, y, h, n) {
    const plank = ((x + y) * 3) % 1 < 0.08 ? 0.7 : 1, v = (0.82 + 0.28 * n) * plank;
    return [124 * v, 96 * v, 48 * v];
  },
};

// floor color per theme: (world x, y, noise 0..1, pit glow 0..1, pit distance, sample index, emissive array) -> [r, g, b]
const FLOORS = {
  hell(x, y, n, glow, ld, k, EM) {
    // dark basalt so yellow lava pits read clearly; faint warm rim near the edge
    const basalt = 0.55 + 0.4 * noise(x * 2.4, y * 2.4) + n * 0.1;
    const ash = noise(x * 5.5 + 3, y * 5.5) > 0.72 ? 1.2 : 1;
    const c = Math.abs(Math.sin(x * 1.9 + Math.sin(y * 1.3) * 2.2) + Math.sin(y * 2.1 + Math.sin(x * 1.1) * 2.0));
    if (c < 0.028) { EM[k] = 1; return [255, 140 + n * 40, 30]; } // yellow-hot crack, not floor-red
    const grit = noise(x * 11, y * 11) > 0.85 ? 0.82 : 1;
    return [(36 * basalt * ash + 50 * glow) * grit, (14 * basalt + 35 * glow) * grit, 12 * basalt * grit];
  },
  robot(x, y, n, glow, ld, k, EM) {
    // dark lab floorboards, green brew light spilling from the vats, chalk rune circles that glow
    const plank = Math.floor(y * 3), seam = (y * 3) % 1 < 0.08;
    const tone = seam ? 0.45 : 0.7 + 0.35 * hash(plank, Math.floor(x * 0.5 + plank * 0.61)) + n * 0.1;
    let r = 74 * tone, g = 50 * tone, b = 36 * tone;
    r += 20 * glow; g += 110 * glow; b += 40 * glow;
    const cx = Math.floor(x / 8) * 8 + 4, cy = Math.floor(y / 8) * 8 + 4, d = Math.hypot(x - cx, y - cy);
    if ((cx * 3 + cy * 5) % 7 === 0 && Math.abs(d - 1.3) < 0.05) { EM[k] = 1; return [190, 140, 255]; }
    return [r, g, b];
  },
  haunt(x, y, n, glow) {
    // Backrooms: damp mustard carpet with stains and threadbare patches; the house: worn floorboards with nail heads.
    // Both go dark toward a hole into the void.
    let r, g, b;
    if (inBackrooms(x, y)) {
      const v = 0.75 + n * 0.35, stain = noise(x * 0.7, y * 0.7);
      const damp = stain > 0.7 ? 0.68 : stain > 0.55 ? 0.85 : 1;
      const thread = noise(x * 4, y * 4) > 0.88 ? 1.15 : 1;
      r = 122 * v * damp * thread; g = 106 * v * damp * thread; b = 60 * v * damp;
    } else {
      const plank = Math.floor(y * 4), seam = (y * 4) % 1 < 0.07;
      const tone = seam ? 0.4 : 0.72 + 0.45 * hash(plank, Math.floor(x * 0.7 + plank * 0.37));
      const wear = noise(x * 3, y * 0.8) > 0.75 ? 0.85 : 1;
      const nail = !seam && Math.abs((x * 3.2) % 1 - 0.5) < 0.03 && Math.abs((y * 4) % 1 - 0.5) < 0.04;
      if (nail) return [38, 32, 22];
      r = 70 * tone * wear; g = 46 * tone * wear; b = 28 * tone * wear;
    }
    const dark = 1 - 0.8 * glow;
    return [r * dark, g * dark, b * dark];
  },
  witch(x, y, n, glow, ld, k, EM) {
    // mossy swamp ground with dark grass tufts, mud patches and glowing mushrooms
    const v = 0.9 + n * 0.45, m = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) * Math.sin(y * 1.1);
    const mud = noise(x * 1.8, y * 1.8) > 0.78;
    let r = mud ? 68 * v : (42 + 22 * m) * v, g = mud ? 58 * v : (78 + 36 * m) * v, b = mud ? 36 * v : (32 + 12 * m) * v;
    if (n > 0.9) { r *= 0.55; g *= 0.65; b *= 0.55; } // grass tufts
    else if (noise(x * 9, y * 9) > 0.9) { r *= 1.15; g *= 1.25; b *= 0.9; } // leaf flecks
    r += 18 * glow; g += 95 * glow; b += 22 * glow;
    const cx = Math.floor(x), cy = Math.floor(y);
    if ((cx * 7 + cy * 13) % 11 === 0 && Math.hypot(x - cx - 0.3, y - cy - 0.6) < 0.09) { EM[k] = 1; return [200, 95, 255]; }
    return [r, g, b];
  },
  ice(x, y, n, glow, ld, k, EM) {
    // packed snow with wind-scoured ice patches and blue cracks near open water
    const pack = 0.8 + 0.25 * noise(x * 2.2, y * 2.2) + n * 0.1;
    const ice = noise(x * 3.5, y * 3.5) > 0.62;
    let r = ice ? 140 * pack : 210 * pack, g = ice ? 175 * pack : 225 * pack, b = ice ? 210 * pack : 240 * pack;
    const crack = Math.abs(Math.sin(x * 2.4 + Math.sin(y * 1.8) * 2)) < 0.04;
    if (crack) { EM[k] = 1; return [120, 190, 255]; }
    r += 20 * glow; g += 50 * glow; b += 80 * glow;
    return [r, g, b];
  },
  crypt(x, y, n, glow, ld, k, EM) {
    // old tomb flagstones, cracked and bone-strewn, with faint green grave-light in the seams
    const cx = Math.floor(x * 0.8), cy = Math.floor(y * 0.8), fx = x * 0.8 - cx, fy = y * 0.8 - cy;
    const tone = 0.7 + 0.25 * hash(cx, cy) + n * 0.1;
    let r = 64 * tone, g = 60 * tone, b = 58 * tone;
    if (fx < 0.05 || fy < 0.05) { if (hash(cx * 3, cy * 7) > 0.8) { EM[k] = 1; return [60, 150, 80]; } r = 26; g = 26; b = 28; }
    else if (noise(x * 7, y * 7) > 0.86) { r = 150; g = 142; b = 120; } // bone chips
    else if (noise(x * 2, y * 2) > 0.7) { r *= 0.8; g *= 0.9; b *= 0.8; } // moss
    const dark = 1 - 0.7 * glow;
    return [r * dark, g * dark, b * dark];
  },
  castle(x, y, n, glow) {
    // cool slate flagstones with dark mortar (matches wall brick greys)
    const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy;
    const tone = 0.78 + 0.2 * hash(cx, cy) + n * 0.1;
    let r = 78 * tone, g = 82 * tone, b = 86 * tone;
    if (fx < 0.06 || fy < 0.06) { r = 38; g = 40; b = 44; }
    else if (noise(x * 5, y * 5) > 0.85) { r *= 0.88; g *= 0.88; b *= 0.9; }
    r += 50 * glow; g += 32 * glow; b += 20 * glow;
    return [r, g, b];
  },
  nuke(x, y, n, glow) {
    // a cobbled lane down the middle of the village, autumn grass and fallen leaves elsewhere
    const lane = Math.abs(x - MW / 2) < 4.5;
    const v = 0.75 + n * 0.25;
    let r, g, b;
    if (lane) {
      const fx = (x * 2.2 + Math.floor(y * 2.2) * 0.5) % 1, fy = (y * 2.2) % 1;
      const stone = 0.75 + 0.3 * hash(Math.floor(x * 2.2 + Math.floor(y * 2.2) * 0.5), Math.floor(y * 2.2));
      r = 88 * stone * v; g = 80 * stone * v; b = 74 * stone * v;
      if (fx < 0.1 || fy < 0.1) { r *= 0.55; g *= 0.55; b *= 0.55; }
    } else {
      const dirt = 0.85 + 0.2 * noise(x * 2, y * 2);
      r = 78 * dirt * v; g = 86 * dirt * v; b = 44 * dirt * v;
      const leaf = noise(x * 7, y * 7);
      if (leaf > 0.86) { r = 190; g = 90; b = 30; } else if (leaf > 0.8) { r = 150; g = 60; b = 28; }
    }
    r += 40 * glow; g += 20 * glow; b += 5 * glow;
    return [r, g, b];
  },
};

// one pixel per heightmap sample; floors use a muted version of their real color so the
// HUD map and lobby cards read the layout with theme detail instead of flat blocks
function buildMini() {
  const { T, theme } = S, { CR, CG, CB } = colors;
  mini.width = T.TW; mini.height = T.TH;
  const mc = mini.getContext('2d'), id = mc.createImageData(T.TW, T.TH), p32 = new Uint32Array(id.data.buffer);
  for (let k = 0; k < T.TW * T.TH; k++) {
    const kind = T.kind[k];
    if (kind === 2) { const c = theme.minimap[2]; p32[k] = pk(c[0], c[1], c[2]); }
    else if (CR) {
      const dim = kind === 1 ? 1 : 0.65;
      p32[k] = pk(Math.min(255, CR[k] * dim), Math.min(255, CG[k] * dim), Math.min(255, CB[k] * dim));
    } else { const c = theme.minimap[kind]; p32[k] = pk(c[0], c[1], c[2]); }
  }
  mc.putImageData(id, 0, 0);
}
