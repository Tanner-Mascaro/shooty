// Loads a level: terrain, precomputed floor colors, minimap image and pickup pads.
import { RES } from '/shared/config.js';
import { LEVELS, MW, MH } from '/shared/levels.js';
import { buildTerrain, findPickups } from '/shared/terrain.js';
import { S } from './state.js';
import { THEMES } from './themes.js';
import { pk } from './render/canvas.js';
import { updateDrone } from './audio.js';
import { applyLevelUI } from './ui.js';

// per heightmap sample: base color and emissive flag (1 = glowing detail, 2 = pit)
export const colors = { CR: null, CG: null, CB: null, EM: null };
export const mini = document.createElement('canvas');

export function setLevel(name) {
  if (!LEVELS[name] || name === S.level) return;
  S.level = name; S.MAP = LEVELS[name]; S.theme = THEMES[name];
  S.T = buildTerrain(S.MAP, RES);
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
  for (let j = 0; j < T.TH; j++) for (let i = 0; i < T.TW; i++) {
    const k = j * T.TW + i, x = (i + 0.5) / RES, y = (j + 0.5) / RES, n = hash(i, j), kd = T.kind[k];
    let r, g, b;
    if (kd === 0) {
      let ld = 99; // distance to nearest pit
      for (const L of pits) ld = Math.min(ld, Math.max(0, Math.max(Math.abs(x - L[0]), Math.abs(y - L[1])) - 0.5));
      const glow = Math.max(0, 1 - ld / 1.5) ** 2;
      [r, g, b] = FLOORS[theme.id](x, y, n, glow, ld, k, EM);
    } else if (kd === 1) { const v = 0.85 + n * 0.3; r = theme.wallTop[0] * v; g = theme.wallTop[1] * v; b = theme.wallTop[2] * v; }
    else { r = 255; g = 90; b = 10; EM[k] = 2; }
    CR[k] = Math.min(255, r); CG[k] = Math.min(255, g); CB[k] = Math.min(255, b);
  }
}

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
