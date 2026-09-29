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
    // dark lab floorboards with a faint chalk rune circle
    for (let y = 0; y < h; y++) {
      const plank = Math.floor(y / 16), seam = y % 16 < 1;
      for (let x = 0; x < w; x++) {
        const tone = seam ? 0.35 : 0.62 + 0.3 * noise(plank, Math.floor((x + plank * 37) / 40)) + 0.08 * noise(x * 0.3, y * 0.05);
        ctx.fillStyle = rgb(74 * tone, 50 * tone, 36 * tone);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.strokeStyle = 'rgba(190,150,255,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 4 / 5;
      ctx[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * w * 0.3, h / 2 + Math.sin(a) * w * 0.3);
    }
    ctx.stroke();
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
    // cool slate flagstones matching the pixel-castle brick greys
    const cell = 18;
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      const n = noise(x * 0.35, y * 0.35);
      const tone = 0.78 + 0.28 * n;
      ctx.fillStyle = rgb(78 * tone, 82 * tone, 86 * tone);
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(36, 40, 46, 0.85)';
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      // top/left lip highlight
      ctx.fillStyle = 'rgba(160, 168, 176, 0.28)';
      ctx.fillRect(x + 1, y + 1, cell - 3, 2);
      ctx.fillRect(x + 1, y + 1, 2, cell - 3);
      if (n > 0.72) {
        ctx.fillStyle = 'rgba(28, 30, 34, 0.3)';
        ctx.fillRect(x + 5, y + 6, 4, 3);
      }
    }
  },
  nuke(ctx, w, h) {
    // autumn grass with fallen leaves
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.7 + 0.3 * noise(x * 0.12, y * 0.12);
      ctx.fillStyle = rgb(78 * v, 84 * v, 44 * v);
      ctx.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 70; i++) {
      const c = [[200, 90, 30], [170, 60, 30], [220, 150, 50]][i % 3];
      ctx.fillStyle = rgb(...c, 0.8);
      ctx.fillRect(noise(i, 11) * w, noise(i, 12) * h, 3, 2);
    }
  },
};

FLOOR_DRAW.plain = (ctx, w, h) => { // a light grain, so the floor palette's colors show through
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = 0.86 + 0.14 * noise(x * 0.15, y * 0.15);
    ctx.fillStyle = rgb(240 * v, 238 * v, 232 * v);
    ctx.fillRect(x, y, 1, 1);
  }
};
FLOOR_DRAW.ship = (ctx, w, h) => { // pale boards with grain: the deck's colors come from the floor palette
  for (let x = 0; x < w; x++) {
    const board = Math.floor(x / 16), seam = x % 16 < 1;
    for (let y = 0; y < h; y++) {
      const v = seam ? 0.5 : (0.82 + 0.1 * noise(board, 3)) * (0.9 + 0.1 * Math.sin(y * 0.3 + board * 1.7 + noise(board, y * 0.03) * 5));
      ctx.fillStyle = rgb(235 * v, 228 * v, 215 * v);
      ctx.fillRect(x, y, 1, 1);
    }
  }
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
    // potion shelves: dark wood boards lined with glowing bottles
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.3 + 0.18 * noise(x * 0.05, y * 0.3);
      ctx.fillStyle = rgb(70 * v, 46 * v, 32 * v);
      ctx.fillRect(x, y, 1, 1);
    }
    const colors = [theme.band, [190, 110, 255], [255, 120, 80], [110, 200, 255], [255, 220, 90]];
    for (let shelf = 0; shelf < 2; shelf++) {
      const base = (shelf + 1) * h / 2 - 10;
      ctx.fillStyle = '#5a3a24';
      ctx.fillRect(0, base, w, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, base + 10, w, 4);
      let k = shelf * 3;
      for (let x = 8; x < w - 30; x += 30 + (noise(x, shelf) * 16 | 0), k++) {
        const bh = 40 + noise(x, shelf + 5) * 44, bw = 18 + (noise(shelf, x) * 10 | 0);
        const [r, g, b] = colors[k % colors.length];
        ctx.fillStyle = rgb(r * 0.5, g * 0.5, b * 0.5);
        ctx.fillRect(x, base - bh, bw, bh);                          // bottle
        ctx.fillStyle = rgb(r, g, b);
        ctx.fillRect(x + 2, base - bh * 0.62, bw - 4, bh * 0.62 - 2); // glowing brew
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 3, base - bh + 4, 3, bh * 0.5);              // glint
        ctx.fillStyle = rgb(r * 0.35, g * 0.35, b * 0.35);
        ctx.fillRect(x + bw / 2 - 4, base - bh - 12, 8, 12);          // neck
        ctx.fillStyle = '#8a6a48';
        ctx.fillRect(x + bw / 2 - 4, base - bh - 16, 8, 4);           // cork
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
  castle(ctx, w, h) {
    // running-bond slate bricks: cool greys, dark mortar, light top/left lips
    const bh = 14, bw = 24;
    const mortar = 'rgba(36, 40, 46, 0.95)';
    for (let y = 0; y < h; y += bh) {
      const ox = ((y / bh) & 1) * (bw / 2);
      for (let x = -bw; x < w; x += bw) {
        const n = noise(x * 0.27, y * 0.41);
        const base = 0.72 + 0.32 * n;
        const r = (88 + 18 * n) * base, g = (92 + 16 * n) * base, b = (96 + 14 * n) * base;
        ctx.fillStyle = rgb(r, g, b);
        ctx.fillRect(x + ox, y, bw - 1, bh - 1);
        ctx.strokeStyle = mortar;
        ctx.strokeRect(x + ox + 0.5, y + 0.5, bw - 2, bh - 2);
        ctx.fillStyle = 'rgba(170, 176, 184, 0.35)';
        ctx.fillRect(x + ox + 1, y + 1, bw - 4, 2);
        ctx.fillRect(x + ox + 1, y + 1, 2, bh - 4);
        ctx.fillStyle = 'rgba(20, 22, 26, 0.22)';
        ctx.fillRect(x + ox + bw - 4, y + 2, 2, bh - 4);
        ctx.fillRect(x + ox + 2, y + bh - 3, bw - 5, 1);
        if (n > 0.82) {
          ctx.fillStyle = 'rgba(40, 44, 48, 0.55)';
          ctx.fillRect(x + ox + bw * 0.35, y + 4, 3, 2);
        }
      }
    }
    for (let x = 6; x < w - 6; x += 32) {
      ctx.fillStyle = 'rgba(28, 30, 34, 0.55)';
      ctx.fillRect(x - 2, h * 0.3, 12, h * 0.38);
      ctx.fillStyle = 'rgba(140, 148, 156, 0.35)';
      ctx.fillRect(x - 3, h * 0.3 - 2, 14, 3);
      ctx.fillRect(x - 3, h * 0.68, 14, 3);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, h - 10, w, 10);
  },
  ship(ctx, w, h) { // deckhouse: tarred clapboard
    for (let y = 0; y < h; y++) {
      const board = Math.floor(y / 14), seam = y % 14 < 2;
      for (let x = 0; x < w; x++) {
        const v = seam ? 0.45 : 0.75 + 0.25 * noise(board * 3, x * 0.05);
        ctx.fillStyle = rgb(118 * v, 86 * v, 58 * v);
        ctx.fillRect(x, y, 1, 1);
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
  if (theme.sea) return makeTexture((ctx, w, h) => { // swell and moonlit caps
    const [r, g, b] = theme.sea;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = 0.7 + 0.45 * noise(x * 0.09 + noise(y * 0.05, 3) * 3, y * 0.2), cap = noise(x * 0.3, y * 0.6) > 0.83 ? 1.8 : 1;
      ctx.fillStyle = rgb(r * n * cap, g * n * cap, b * n * cap);
      ctx.fillRect(x, y, 1, 1);
    }
  });
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
  const look = theme.id === 'crypt' || theme.id === 'yard' ? 'castle' : theme.id; // the Crypt and the graveyard borrow the castle's stonework
  const floorDraw = theme.id === 'cove' || theme.id === 'yard' ? FLOOR_DRAW.plain : FLOOR_DRAW[look] || FLOOR_DRAW.hell; // colors from the floor palette
  const wallDraw = theme.id === 'cove' ? WALL_DRAW.ship : WALL_DRAW[look] || WALL_DRAW.hell;
  const floor = makeTexture((ctx, w, h) => floorDraw(ctx, w, h), { size: 256 });
  floor.repeat.set(18, 18);
  const wall = makeTexture((ctx, w, h) => wallDraw(ctx, w, h, theme), { size: 256 });
  wall.repeat.set(1.5, 1);
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
  // cottage walls and tree trunks: brown planks, the same on every map (snowy or not)
  const wood = makeTexture((ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const plank = Math.floor(x / 16), seam = x % 16 < 1;
      for (let y = 0; y < h; y++) {
        const grain = 0.85 + 0.15 * Math.sin(y * 0.35 + plank * 2.1 + noise(plank, y * 0.02) * 4);
        const v = seam ? 0.45 : (0.72 + 0.28 * noise(plank, 7)) * grain;
        ctx.fillStyle = rgb(150 * v, 104 * v, 66 * v);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  wood.repeat.set(2, 2);
  // tree bark: dark vertical furrows between ridges (wraps around trunks, so it tiles sideways)
  const bark = makeTexture((ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const ridge = Math.abs(Math.sin(x * Math.PI / 16 + noise(x >> 4, 1) * 1.5));
      for (let y = 0; y < h; y++) {
        const wobble = Math.abs(Math.sin((x + 4 * Math.sin(y * 0.09 + (x >> 4))) * Math.PI / 16));
        const v = (0.35 + 0.65 * Math.min(ridge, wobble) ** 0.6) * (0.8 + 0.2 * noise(x, y >> 2));
        ctx.fillStyle = rgb(118 * v, 84 * v, 60 * v);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  bark.repeat.set(2, 2);
  // cottage upper storeys: rough lime plaster, near white so the cottage colour tints it
  const plaster = makeTexture((ctx, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.86 + 0.1 * noise(x >> 1, y >> 1) + 0.04 * noise(x, y);
      ctx.fillStyle = rgb(255 * v, 250 * v, 240 * v);
      ctx.fillRect(x, y, 1, 1);
    }
  });
  // cottage roofs: rows of overlapping shingles, grey so the roof colour tints it
  const shingle = makeTexture((ctx, w, h) => {
    const rowH = 16, tileW = 22;
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / rowH), fy = (y % rowH) / rowH;
      for (let x = 0; x < w; x++) {
        const xx = x + (row % 2) * tileW / 2, tile = Math.floor(xx / tileW), edge = xx % tileW < 1.5;
        const v = edge ? 0.45 : (0.95 - 0.35 * fy) * (0.85 + 0.15 * noise(tile, row));
        ctx.fillStyle = rgb(255 * v, 255 * v, 255 * v);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  const pit = pitTexture(theme);
  pit.repeat.set(8, 8);
  const set = { floor, wall, rock, wood, bark, plaster, shingle, crate, pit };
  cache.set(theme.id, set);
  return set;
}

export function matTexture(mats, mat) {
  if (mat === MAT.PIT) return mats.pit;
  if (mat === MAT.FLOOR) return mats.floor;
  if (mat === MAT.CRATE) return mats.crate;
  if (mat === MAT.RACK || mat === MAT.WALL) return mats.wall;
  if (mat === MAT.BARK) return mats.wood;
  if (mat === MAT.ROCK || mat === MAT.LAVA || mat === MAT.ROOTS) return mats.rock;
  if (mat === MAT.LEAVES) return mats.rock;
  return mats.floor;
}
