// Procedural canvas textures per theme — generated once when a level loads.
import { MAT } from '/shared/terrain.js';
import * as THREE from 'three';

const TEX_SIZE = 128;
const cache = new Map();

function canvas2d(size = TEX_SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d') };
}

function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function rgb(r, g, b, a = 1) {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

function makeTexture(draw, opts = {}) {
  const { c, ctx } = canvas2d(opts.size || TEX_SIZE);
  draw(ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const FLOOR_DRAW = {
  hell(ctx, w, h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = noise(x * 0.08, y * 0.08), ash = noise(x * 0.2, y * 0.2);
      const v = 0.45 + n * 0.35 + ash * 0.15;
      ctx.fillStyle = rgb(36 * v + 8, 14 * v, 10 * v);
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.strokeStyle = 'rgba(255,140,30,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(noise(i, 1) * w, noise(i, 2) * h);
      ctx.lineTo(noise(i, 3) * w, noise(i, 4) * h);
      ctx.stroke();
    }
  },
  robot(ctx, w, h) {
    const cell = 16;
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      const v = ((x / cell + y / cell) & 1) ? 0.88 : 0.78;
      ctx.fillStyle = rgb(48 * v, 54 * v, 62 * v);
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = '#16181c';
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      ctx.fillStyle = '#6a727c';
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + cell - 5, y + 3, 2, 2);
      ctx.fillRect(x + 3, y + cell - 5, 2, 2);
      ctx.fillRect(x + cell - 5, y + cell - 5, 2, 2);
    }
  },
  witch(ctx, w, h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const m = 0.5 + 0.5 * Math.sin(x * 0.07) * Math.sin(y * 0.09);
      const mud = noise(x * 0.05, y * 0.05) > 0.72;
      const v = 0.6 + noise(x * 0.2, y * 0.2) * 0.4;
      ctx.fillStyle = mud ? rgb(42 * v, 36 * v, 22 * v) : rgb((26 + 16 * m) * v, (48 + 28 * m) * v, (20 + 8 * m) * v);
      ctx.fillRect(x, y, 1, 1);
    }
  },
  haunt(ctx, w, h) {
    for (let y = 0; y < h; y++) {
      const plank = Math.floor(y / 8), seam = y % 8 < 1;
      for (let x = 0; x < w; x++) {
        const tone = seam ? 0.4 : 0.7 + 0.3 * noise(plank, Math.floor(x / 10));
        ctx.fillStyle = rgb(70 * tone, 46 * tone, 28 * tone);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },
  ice(ctx, w, h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pack = 0.8 + 0.2 * noise(x * 0.06, y * 0.06);
      const ice = noise(x * 0.1, y * 0.1) > 0.55;
      ctx.fillStyle = ice ? rgb(140 * pack, 175 * pack, 210 * pack) : rgb(210 * pack, 225 * pack, 240 * pack);
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.strokeStyle = 'rgba(120,190,255,0.5)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(noise(i, 5) * w, 0);
      ctx.lineTo(noise(i, 6) * w, h);
      ctx.stroke();
    }
  },
  castle(ctx, w, h) {
    const cell = 20;
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      const tone = 0.7 + 0.3 * noise(x, y);
      ctx.fillStyle = rgb(72 * tone, 64 * tone, 52 * tone);
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = '#2a241c';
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  },
  nuke(ctx, w, h) {
    ctx.fillStyle = '#5a6040';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (noise(x * 0.15, y * 0.15) > 0.65) {
        ctx.fillStyle = rgb(48, 48, 46);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = '#c8b43c';
    ctx.fillRect(w / 2 - 1, 0, 2, h);
  },
};

const WALL_DRAW = {
  hell(ctx, w, h, theme) {
    const [wr, wg, wb] = theme.wall;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const band = Math.sin(y * 0.2) > 0.55 ? 0.7 : 1;
      const n = 0.75 + noise(x * 0.1, y * 0.1) * 0.35;
      ctx.fillStyle = rgb(wr * n * band, wg * n * band, wb * n * band);
      ctx.fillRect(x, y, 1, 1);
    }
    const [br, bg, bb] = theme.band;
    ctx.fillStyle = rgb(br, bg, bb, 0.85);
    ctx.fillRect(0, h * 0.45, w, 4);
  },
  robot(ctx, w, h, theme) {
    ctx.fillStyle = rgb(...theme.wall);
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = '#1a1e24';
      ctx.fillRect(x + 2, 8, 12, h - 16);
      for (let y = 14; y < h - 14; y += 10) {
        ctx.fillStyle = (y / 10 | 0) % 3 === 0 ? rgb(...theme.band) : '#2a3038';
        ctx.fillRect(x + 4, y, 8, 4);
      }
    }
  },
  witch(ctx, w, h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.5 + 0.5 * noise(x * 0.15, y * 0.08);
      ctx.fillStyle = rgb(34 * v, 82 * v, 30 * v);
      ctx.fillRect(x, y, 1, 1);
    }
  },
  haunt(ctx, w, h, theme) {
    ctx.fillStyle = rgb(...theme.wall);
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 8; x < w; x += 24) {
      ctx.fillStyle = 'rgba(40,30,10,0.35)';
      ctx.fillRect(x, 16, 10, h - 32);
      ctx.fillStyle = rgb(...theme.band, 0.25);
      ctx.fillRect(x + 2, 20, 6, h - 40);
    }
  },
  ice(ctx, w, h) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mott = 0.75 + 0.35 * noise(x * 0.1, y * 0.1);
      ctx.fillStyle = rgb(170 * mott, 200 * mott, 230 * mott);
      ctx.fillRect(x, y, 1, 1);
    }
  },
  castle(ctx, w, h, theme) {
    const bh = 14, bw = 28;
    for (let y = 0; y < h; y += bh) {
      const ox = ((y / bh) & 1) * (bw / 2);
      for (let x = -bw; x < w; x += bw) {
        const tone = 0.75 + 0.25 * noise(x, y);
        ctx.fillStyle = rgb(theme.wall[0] * tone, theme.wall[1] * tone, theme.wall[2] * tone);
        ctx.fillRect(x + ox, y, bw - 1, bh - 1);
      }
    }
  },
  nuke(ctx, w, h, theme) {
    ctx.fillStyle = rgb(...theme.wall);
    ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 20) {
      ctx.fillStyle = 'rgba(80,60,30,0.4)';
      ctx.fillRect(10, y, w - 20, 12);
      ctx.fillStyle = 'rgba(180,200,220,0.35)';
      ctx.fillRect(14, y + 2, w - 28, 8);
    }
  },
};

function pitTexture(theme) {
  const [r, g, b] = theme.band;
  return makeTexture((ctx, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = 0.6 + 0.4 * noise(x * 0.2 + performance.now() * 0, y * 0.2);
      ctx.fillStyle = rgb(r * n, g * n * 0.85, b * n * 0.5);
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

export function clearTextureCache() {
  for (const m of cache.values()) {
    for (const t of Object.values(m)) if (t && t.dispose) t.dispose();
  }
  cache.clear();
}

export function texturesFor(theme) {
  if (cache.has(theme.id)) return cache.get(theme.id);
  const floorDraw = FLOOR_DRAW[theme.id] || FLOOR_DRAW.hell;
  const wallDraw = WALL_DRAW[theme.id] || WALL_DRAW.hell;
  const floor = makeTexture((ctx, w, h) => floorDraw(ctx, w, h));
  floor.repeat.set(30, 30);
  const wall = makeTexture((ctx, w, h) => wallDraw(ctx, w, h, theme));
  wall.repeat.set(2, 1);
  const rock = makeTexture((ctx, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = 0.65 + 0.35 * noise(x * 0.12, y * 0.12);
      if (theme.id === 'ice') ctx.fillStyle = rgb(160 * n, 190 * n, 220 * n);
      else ctx.fillStyle = rgb(90 * n, 50 * n, 40 * n);
      ctx.fillRect(x, y, 1, 1);
    }
  });
  rock.repeat.set(4, 4);
  const crate = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#7c6030';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3a2a14';
    for (let i = 0; i < 4; i++) ctx.strokeRect(4 + i, 4 + i, w - 8 - i * 2, h - 8 - i * 2);
    ctx.fillStyle = '#a08040';
    ctx.fillRect(w * 0.45, 0, 4, h);
    ctx.fillRect(0, h * 0.45, w, 4);
  });
  const pit = pitTexture(theme);
  pit.repeat.set(8, 8);
  const set = { floor, wall, rock, crate, pit };
  cache.set(theme.id, set);
  return set;
}

export function matTexture(mats, mat) {
  if (mat === MAT.PIT) return mats.pit;
  if (mat === MAT.FLOOR) return mats.floor;
  if (mat === MAT.CRATE) return mats.crate;
  if (mat === MAT.RACK || mat === MAT.WALL) return mats.wall;
  if (mat === MAT.ROCK || mat === MAT.LAVA || mat === MAT.BARK || mat === MAT.ROOTS) return mats.rock;
  if (mat === MAT.LEAVES) return mats.rock;
  return mats.floor;
}
