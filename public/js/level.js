// Loads a level: terrain, precomputed floor colors, minimap image and pickup pads.
import { RES } from '/shared/config.js';
import { LEVELS, MW, MH } from '/shared/levels.js';
import { buildTerrain, findPickups, MAT, noise } from '/shared/terrain.js';
import { S } from './state.js';
import { THEMES } from './themes.js';
import { pk } from './render/canvas.js';
import { updateDrone } from './audio.js';
import { applyLevelUI } from './ui.js';

// per heightmap sample: base color and emissive flag (1 = glowing detail, 2 = pit, 3 = lava on a volcano)
export const colors = { CR: null, CG: null, CB: null, EM: null };
export const mini = document.createElement('canvas');

export function setLevel(name) {
  if (!LEVELS[name] || name === S.level) return;
  S.level = name; S.MAP = LEVELS[name]; S.theme = THEMES[name];
  S.T = buildTerrain(S.MAP, RES, name);
  buildColors(); buildMini();
  S.pickupSpots = findPickups(S.MAP);
  S.pickupActive = S.pickupSpots.map(() => true);
  S.embers = []; S.particles = []; S.corpses = []; S.tracers = [];
  applyLevelUI(name, S.theme);
  updateDrone();
}

const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function buildColors() {
  const { T, MAP, theme } = S, NT = T.TW * T.TH;
  const CR = colors.CR = new Uint8Array(NT), CG = colors.CG = new Uint8Array(NT), CB = colors.CB = new Uint8Array(NT), EM = colors.EM = new Uint8Array(NT);
  const pits = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (MAP[y][x] === 'L') pits.push([x + 0.5, y + 0.5]);
  // shapes are lit from the side the level's moon / planet is on
  const lx = Math.cos(theme.orbA) * 0.6, ly = Math.sin(theme.orbA) * 0.6, lz = 0.8;
  const h = (i, j) => T.hgt[Math.min(T.TH - 1, Math.max(0, j)) * T.TW + Math.min(T.TW - 1, Math.max(0, i))];
  for (let j = 0; j < T.TH; j++) for (let i = 0; i < T.TW; i++) {
    const k = j * T.TW + i, x = (i + 0.5) / RES, y = (j + 0.5) / RES, n = hash(i, j), m = T.mat[k];
    let r, g, b;
    if (m === MAT.FLOOR) {
      let ld = 99; // distance to nearest pit
      for (const L of pits) ld = Math.min(ld, Math.max(0, Math.max(Math.abs(x - L[0]), Math.abs(y - L[1])) - 0.5));
      const glow = Math.max(0, 1 - ld / 1.5) ** 2;
      [r, g, b] = FLOORS[theme.id](x, y, n, glow, ld, k, EM);
    } else if (m === MAT.PIT) { r = 255; g = 90; b = 10; EM[k] = 2; }
    else {
      [r, g, b] = SHAPE_COLORS[m](x, y, T.hgt[k], n, theme);
      if (m === MAT.LAVA) EM[k] = 3;
      else {
        // slope shading from the surface normal
        const dx = (h(i + 1, j) - h(i - 1, j)) * RES / 2, dy = (h(i, j + 1) - h(i, j - 1)) * RES / 2;
        const shade = 0.45 + 0.75 * Math.max(0, (-dx * lx - dy * ly + lz) / Math.hypot(dx, dy, 1));
        r *= shade; g *= shade; b *= shade;
      }
    }
    CR[k] = Math.min(255, r); CG[k] = Math.min(255, g); CB[k] = Math.min(255, b);
  }
}

// obstacle surface colors by material: (world x, y, height, noise 0..1, theme) -> [r, g, b]
const SHAPE_COLORS = {
  [MAT.ROCK](x, y, h, n) { // volcanic rock with darker strata
    const v = 0.75 + 0.35 * noise(x * 3, y * 3) + n * 0.1, band = Math.sin(h * 11 + noise(x, y) * 4) > 0.6 ? 0.7 : 1;
    return [82 * v * band, 38 * v * band, 32 * v * band];
  },
  [MAT.LAVA]() { return [255, 90, 10]; },
  [MAT.BARK](x, y, h, n) { const v = 0.8 + 0.3 * n; return [64 * v, 46 * v, 32 * v]; },
  [MAT.ROOTS](x, y, h, n) { const v = 0.7 + 0.5 * noise(x * 6, y * 6); return [52 * v, 50 * v, 30 * v]; },
  [MAT.LEAVES](x, y, h, n) { // bushes and hedges: mottled greens with light speckles
    const v = 0.6 + 0.6 * noise(x * 5, y * 5);
    return n > 0.9 ? [90, 140, 60] : [34 * v, 80 * v, 30 * v];
  },
  [MAT.WALL](x, y, h, n, theme) { const v = 0.85 + n * 0.3; return theme.wallTop.map(c => c * v); },
  [MAT.RACK](x, y) { // rack tops: dark with vent slots
    const vent = (x * 10) % 1 < 0.5 && (y * 3) % 1 < 0.8;
    return vent ? [22, 25, 30] : [44, 48, 56];
  },
  [MAT.CRATE](x, y, h, n) { const v = 0.85 + 0.25 * n; return [118 * v, 94 * v, 46 * v]; },
};

// floor color per theme: (world x, y, noise 0..1, pit glow 0..1, pit distance, sample index, emissive array) -> [r, g, b]
const FLOORS = {
  hell(x, y, n, glow, ld, k, EM) {
    const v = 0.75 + n * 0.5;
    const c = Math.abs(Math.sin(x * 1.9 + Math.sin(y * 1.3) * 2.2) + Math.sin(y * 2.1 + Math.sin(x * 1.1) * 2.0));
    if (c < 0.022) { EM[k] = 1; return [255, 70 + n * 50, 15]; } // glowing crack
    return [60 * v + 130 * glow, 24 * v + 35 * glow, 20 * v];
  },
  robot(x, y, n, glow, ld, k, EM) {
    // metal floor plates with seams, rivets, hazard stripes by the acid and floor lights
    const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy;
    const v = (0.9 + n * 0.15) * (((cx + cy) & 1) ? 1 : 0.88);
    let r = 52 * v, g = 58 * v, b = 66 * v;
    if (fx < 0.07 || fy < 0.07) { r = 28; g = 31; b = 36; }
    if ((Math.abs(fx - 0.15) < 0.04 || Math.abs(fx - 0.85) < 0.04) && (Math.abs(fy - 0.15) < 0.04 || Math.abs(fy - 0.85) < 0.04)) { r = 95; g = 100; b = 110; }
    if (ld < 0.5) { const s = ((x + y) * 2.5) % 1 < 0.5; r = s ? 200 : 25; g = s ? 165 : 25; b = s ? 20 : 25; }
    r += 10 * glow; g += 60 * glow; b += 40 * glow;
    if (cx % 4 === 2 && cy % 4 === 2 && Math.hypot(fx - 0.5, fy - 0.5) < 0.12) { EM[k] = 1; return [60, 220, 255]; }
    return [r, g, b];
  },
  witch(x, y, n, glow, ld, k, EM) {
    // mossy swamp ground with dark grass tufts and glowing mushrooms
    const v = 0.7 + n * 0.5, m = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) * Math.sin(y * 1.1);
    let r = (28 + 14 * m) * v, g = (46 + 26 * m) * v, b = (22 + 6 * m) * v;
    if (n > 0.93) { r *= 0.5; g *= 0.6; b *= 0.5; }
    r += 20 * glow; g += 90 * glow; b += 20 * glow;
    const cx = Math.floor(x), cy = Math.floor(y);
    if ((cx * 7 + cy * 13) % 11 === 0 && Math.hypot(x - cx - 0.3, y - cy - 0.6) < 0.08) { EM[k] = 1; return [190, 90, 255]; }
    return [r, g, b];
  },
};

// one pixel per heightmap sample
function buildMini() {
  const { T, theme } = S;
  mini.width = T.TW; mini.height = T.TH;
  const mc = mini.getContext('2d'), id = mc.createImageData(T.TW, T.TH), p32 = new Uint32Array(id.data.buffer);
  for (let k = 0; k < T.TW * T.TH; k++) { const c = theme.minimap[T.kind[k]]; p32[k] = pk(c[0], c[1], c[2]); }
  mc.putImageData(id, 0, 0);
}
