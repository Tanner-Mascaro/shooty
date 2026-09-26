// Billboard shapes. Each px(u, v, glint) takes u across (0..1) and v down (0 = top, 1 = bottom)
// and returns an index into the sprite's palette (0 = transparent). `emit` lists palette
// indices that glow (ignore fog).

// the player characters are pixel art in characters.js
import { PLAYER_SPRITES } from './characters.js';
export { PLAYER_SPRITES };

export const PLAYER_SKINS = Object.keys(PLAYER_SPRITES);
export const PLAYER_SKIN_NAMES = {
  demon: 'Demon', robot: 'Robot', witch: 'Witch', cowboy: 'Cowboy', nun: 'Nun', knight: 'Knight',
  bodybuilder: 'Bodybuilder', ghost: 'Ghost', goose: 'Goose', construction: 'Construction',
  superhero: 'Superhero', ninja: 'Ninja', werewolf: 'Werewolf', zombie: 'Zombie', astronaut: 'Astronaut',
  mummy: 'Mummy', vampire: 'Vampire', slime: 'Slime', naked: 'Naked',
};

// --- pickups ---
function healthPx(u, v) {
  if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) return 0;
  if ((Math.abs(u - 0.5) < 0.14 && v > 0.18 && v < 0.82) || (Math.abs(v - 0.5) < 0.14 && u > 0.18 && u < 0.82)) return 3;
  return 1;
}

// side views, muzzle to the right: [u0, u1, v0, v1, color] boxes, later ones on top.
// Colors: 1 body (tinted with the gun's color), 2 black metal, 3 glowing accent, 4 wood
const GUN_SHAPES = {
  pistol: { w: 0.35, h: 0.26, boxes: [[0.05, 0.95, 0.12, 0.45, 1], [0.12, 0.88, 0.25, 0.32, 3], [0.06, 0.36, 0.45, 0.95, 2],
    [0.36, 0.56, 0.45, 0.62, 2], [0.88, 0.95, 0.04, 0.12, 2]] },
  deagle: { w: 0.48, h: 0.3, boxes: [[0.02, 0.98, 0.08, 0.4, 1], [0.08, 0.92, 0.18, 0.28, 3], [0.04, 0.28, 0.4, 0.98, 2],
    [0.28, 0.5, 0.4, 0.55, 2], [0.65, 0.98, 0.04, 0.16, 2], [0.88, 1, 0.0, 0.1, 2], [0.5, 0.7, 0.28, 0.36, 3]] },
  revolver: { w: 0.5, h: 0.32, boxes: [[0.1, 0.95, 0.16, 0.38, 1], [0.12, 0.48, 0.2, 0.55, 2], [0.48, 0.72, 0.12, 0.58, 2],
    [0.08, 0.32, 0.38, 0.98, 4], [0.7, 0.98, 0.18, 0.32, 2], [0.2, 0.42, 0.22, 0.3, 3], [0.88, 0.98, 0.08, 0.18, 2]] },
  rifle: { w: 0.85, h: 0.34, boxes: [[0, 0.2, 0.3, 0.72, 2], [0.2, 0.56, 0.24, 0.55, 1], [0.56, 0.8, 0.28, 0.5, 1], [0.8, 1, 0.36, 0.45, 2],
    [0.3, 0.44, 0.1, 0.24, 2], [0.72, 0.76, 0.12, 0.28, 2], [0.44, 0.54, 0.55, 0.78, 2], [0.47, 0.58, 0.78, 0.98, 2],
    [0.27, 0.35, 0.55, 0.9, 2], [0.22, 0.78, 0.36, 0.42, 3]] },
  burst: { w: 0.78, h: 0.36, boxes: [[0.02, 0.2, 0.3, 0.68, 2], [0.2, 0.58, 0.2, 0.5, 1], [0.58, 0.82, 0.26, 0.46, 1], [0.82, 1, 0.32, 0.42, 2],
    [0.3, 0.46, 0.06, 0.2, 2], [0.42, 0.55, 0.5, 0.95, 2], [0.42, 0.55, 0.9, 0.98, 3], [0.22, 0.78, 0.32, 0.38, 3],
    [0.6, 0.78, 0.12, 0.2, 3]] },
  carbine: { w: 0.68, h: 0.3, boxes: [[0.02, 0.16, 0.28, 0.65, 2], [0.16, 0.55, 0.22, 0.5, 1], [0.55, 0.82, 0.28, 0.46, 1], [0.82, 0.98, 0.34, 0.42, 2],
    [0.28, 0.4, 0.1, 0.22, 2], [0.38, 0.5, 0.5, 0.88, 2], [0.2, 0.72, 0.32, 0.38, 3], [0.7, 0.82, 0.2, 0.28, 3]] },
  sniper: { w: 1.1, h: 0.3, boxes: [[0, 0.26, 0.38, 0.8, 2], [0.1, 0.26, 0.3, 0.38, 2], [0.26, 0.5, 0.36, 0.58, 1], [0.5, 0.7, 0.4, 0.56, 1],
    [0.7, 1, 0.43, 0.49, 2], [0.96, 1, 0.4, 0.52, 2], [0.26, 0.56, 0.08, 0.26, 2], [0.24, 0.28, 0.05, 0.29, 2], [0.53, 0.58, 0.02, 0.32, 2],
    [0.57, 0.59, 0.05, 0.29, 3], [0.33, 0.36, 0.26, 0.36, 2], [0.47, 0.5, 0.26, 0.36, 2], [0.3, 0.36, 0.58, 0.85, 2],
    [0.28, 0.68, 0.45, 0.49, 3]] },
  crossbow: { w: 1.0, h: 0.42, boxes: [[0.08, 0.38, 0.42, 0.75, 4], [0.38, 0.72, 0.35, 0.58, 1], [0.05, 0.22, 0.28, 0.48, 2],
    [0.78, 0.95, 0.28, 0.48, 2], [0.2, 0.8, 0.22, 0.32, 2], [0.55, 0.7, 0.58, 0.95, 4], [0.35, 0.9, 0.4, 0.46, 3],
    [0.88, 0.98, 0.38, 0.52, 2], [0.42, 0.52, 0.18, 0.28, 3]] },
  smg: { w: 0.5, h: 0.36, boxes: [[0, 0.16, 0.26, 0.34, 2], [0, 0.05, 0.26, 0.62, 2], [0.16, 0.8, 0.18, 0.5, 1], [0.8, 0.96, 0.28, 0.4, 2],
    [0.45, 0.57, 0.5, 1, 2], [0.45, 0.57, 0.92, 1, 3], [0.22, 0.33, 0.5, 0.85, 2], [0.2, 0.76, 0.3, 0.36, 3]] },
  uzi: { w: 0.42, h: 0.42, boxes: [[0.05, 0.88, 0.12, 0.45, 1], [0.88, 1, 0.22, 0.36, 2], [0.35, 0.58, 0.45, 1, 2],
    [0.35, 0.58, 0.88, 1, 3], [0.12, 0.28, 0.45, 0.78, 2], [0.1, 0.82, 0.24, 0.3, 3], [0.0, 0.12, 0.2, 0.35, 2]] },
  lmg: { w: 0.78, h: 0.42, boxes: [[0, 0.12, 0.2, 0.3, 2], [0.12, 0.72, 0.12, 0.48, 1], [0.72, 1, 0.24, 0.38, 2],
    [0.35, 0.58, 0.48, 1, 2], [0.35, 0.58, 0.88, 1, 3], [0.18, 0.32, 0.48, 0.85, 2], [0.15, 0.7, 0.26, 0.32, 3],
    [0.48, 0.7, 0.08, 0.18, 2], [0.55, 0.85, 0.34, 0.42, 3]] },
  shotgun: { w: 0.9, h: 0.3, boxes: [[0, 0.26, 0.32, 0.78, 4], [0.26, 0.44, 0.24, 0.56, 1], [0.44, 1, 0.26, 0.4, 2], [0.44, 0.9, 0.42, 0.52, 2],
    [0.56, 0.76, 0.38, 0.62, 4], [0.28, 0.35, 0.56, 0.88, 4], [0.27, 0.43, 0.36, 0.42, 3], [0.97, 1, 0.2, 0.26, 3]] },
};
const gunCache = {};
function gunPx(w) {
  const boxes = GUN_SHAPES[w].boxes;
  return gunCache[w] || (gunCache[w] = (u, v) => {
    let c = 0;
    for (const [u0, u1, v0, v1, k] of boxes) if (u >= u0 && u < u1 && v >= v0 && v < v1) c = k;
    return c;
  });
}

// world size + shape for a floating pickup
export function pickupSprite(weapon, color) {
  if (weapon === 'ammo') return AMMO_CRATE;
  if (weapon === 'nade') return NADE_SPRITE;
  if (weapon === 'health') return { w: 0.4, h: 0.4, px: healthPx, pal: [null, [235, 235, 235], null, [230, 30, 30]], emit: [1, 3] };
  const g = GUN_SHAPES[weapon] || GUN_SHAPES.pistol, body = color.map(c => 40 + c * 0.35); // each gun's body carries its color
  return { w: g.w, h: g.h, px: gunPx(weapon in GUN_SHAPES ? weapon : 'pistol'), pal: [null, body, [26, 26, 30], color, [110, 70, 40]], emit: [3] };
}

function nadePx(u, v) {
  // bold front-facing MK2: fat olive body, dark cast bands, yellow spoon + pin (reads at distance)
  const bx = (u - 0.5) / 0.34, by = (v - 0.58) / 0.36, br = bx * bx + by * by;
  if (br < 1) {
    const rim = br > 0.78;
    const bandH = Math.abs(((v - 0.42) * 9) % 1 - 0.5) < 0.14;
    const bandV = Math.abs(((u - 0.32) * 8) % 1 - 0.5) < 0.12;
    if (rim) return 2;
    if (bandH || bandV) return 2;
    if (bx < -0.25 && by < -0.15 && br < 0.35) return 5; // sheen
    return ((u * 20 | 0) + (v * 18 | 0)) & 1 ? 1 : 4;
  }
  // fuze well
  if (u > 0.4 && u < 0.6 && v > 0.22 && v < 0.38) return 2;
  // spoon lever (fat yellow bar)
  if (u > 0.52 && u < 0.86 && v > 0.1 && v < 0.3) {
    const t = (u - 0.52) / 0.34;
    if (Math.abs(v - (0.16 + t * 0.06)) < 0.055) return 3;
  }
  // pull-pin ring
  const rd = Math.hypot(u - 0.78, v - 0.14);
  if (rd > 0.055 && rd < 0.1) return 3;
  // spark tip on fuze
  if (Math.hypot(u - 0.5, v - 0.2) < 0.04) return 3;
  return 0;
}
const NADE_SPRITE = {
  w: 0.62, h: 0.72, px: nadePx,
  pal: [null, [86, 190, 72], [18, 48, 22], [255, 220, 60], [52, 140, 48], [180, 245, 150]],
  emit: [3, 5],
};

// --- hut roof billboard (collision-free; walls are terrain) ---
// Sprite v=0 is the top of the billboard, v=1 the bottom (sits on the walls).
const HUT_ROOF = {
  witch: {
    w: 2.55, h: 1.05, emit: [],
    pal: [null, [28, 55, 22], [48, 88, 36], [70, 50, 28], [90, 70, 40]],
    px(u, v) {
      const half = Math.abs(u - 0.5) * 2;
      const vTop = 0.06 + half * 0.72; // peak up top-center; eaves down at the sides
      const vBot = 0.94;
      if (v < vTop || v > vBot) return 0;
      if (v > vBot - 0.1) return 3;
      return ((u * 14 | 0) ^ (v * 10 | 0)) & 1 ? 1 : 2;
    },
  },
  ice: {
    w: 2.55, h: 1.0, emit: [3],
    pal: [null, [170, 200, 230], [140, 175, 210], [220, 240, 255], [200, 220, 245]],
    px(u, v) {
      const half = Math.abs(u - 0.5) * 2;
      const vTop = 0.05 + half * 0.7, vBot = 0.94;
      if (v < vTop || v > vBot) return 0;
      if (half < 0.08 && v < vTop + 0.25) return 3; // ice spike on the ridge
      return v > vBot - 0.12 ? 3 : ((u * 12 | 0) + (v * 8 | 0)) & 1 ? 1 : 2;
    },
  },
  hell: {
    w: 2.55, h: 1.0, emit: [3],
    pal: [null, [70, 32, 24], [48, 22, 18], [255, 90, 20], [110, 50, 35]],
    px(u, v) {
      const half = Math.abs(u - 0.5) * 2;
      const vTop = 0.05 + half * 0.7, vBot = 0.94;
      if (v < vTop || v > vBot) return 0;
      if (u > 0.62 && u < 0.8 && v < vTop + 0.2) return 3; // vent glow near ridge
      return ((u * 11 | 0) ^ (v * 9 | 0)) & 1 ? 1 : 2;
    },
  },
};
export function hutRoofSprite(style) {
  return HUT_ROOF[style] || HUT_ROOF.witch;
}

// --- swamp tree canopies: a lumpy blob of leaves with moss hanging off the bottom ---
const canopyCache = [];
export function canopySprite(variant) {
  return canopyCache[variant] || (canopyCache[variant] = {
    w: 1, h: 1, emit: [],
    pal: [null, [22, 48, 20], [34, 70, 28], [58, 104, 40], [80, 96, 64]],
    px(u, v) {
      const dx = (u - 0.5) * 2, dy = (v - 0.45) * 2.3, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const edge = 0.82 + 0.1 * Math.sin(a * 5 + variant * 2.1) + 0.06 * Math.sin(a * 11 + variant);
      if (d < edge) {
        const lump = Math.sin(u * 23 + variant) * Math.sin(v * 19 - variant * 3);
        return lump > 0.55 ? 3 : dy > 0.35 || lump < -0.6 ? 1 : 2; // light tops, shaded underside
      }
      // Spanish moss strands hanging below
      if (v > 0.55 && Math.abs(dx) < 0.7 && Math.sin(u * 60 + variant * 4) > 0.82 && v < 0.62 + 0.35 * Math.abs(Math.sin(u * 17 + variant))) return 4;
      return 0;
    },
  });
}

// --- small ammo crate: olive box with a brass band and a bullet stencil ---
const AMMO_CRATE = { w: 0.42, h: 0.3, emit: [3], pal: [null, [74, 82, 44], [34, 38, 20], [230, 200, 90], [104, 114, 62]],
  px(u, v) {
    if (u < 0.06 || u > 0.94 || v < 0.08 || v > 0.94) return 2;
    if (v < 0.24) return 4;                                                 // lid
    if (v > 0.44 && v < 0.54) return 3;                                     // brass band
    if (v > 0.6 && v < 0.86 && [0.3, 0.5, 0.7].some(c => Math.abs(u - c) < 0.04)) return 3; // rounds
    return 1;
  } };

// --- loot box: a crate seen a little from above, banded in the level's accent color ---
function boxPx(u, v) {
  const top = 0.24;
  if (v < top) { // lid, narrower toward the back
    const inset = (top - v) / top * 0.12;
    if (u < inset || u > 1 - inset) return 0;
    return u < inset + 0.05 || u > 1 - inset - 0.05 || v < 0.04 ? 2 : 3;
  }
  if (u < 0.07 || u > 0.93 || v < top + 0.06 || v > 0.93) return 2;        // frame
  if (v > 0.52 && v < 0.6) return 4;                                        // glowing band
  if (Math.abs(u - 0.5) < 0.06 && v > 0.62) return 2;                       // latch
  return (u * 9 | 0) % 3 === 0 ? 5 : 1;                                     // planks
}
const boxCache = {};
export function boxSprite(accent) {
  return boxCache[accent] ??= { w: 0.6, h: 0.5, px: boxPx, emit: [4],
    pal: [null, [104, 76, 48], [44, 30, 20], [140, 104, 68], accent.split(',').map(Number), [88, 64, 40]] };
}
