// Billboard shapes. Each px(u, v, glint) takes u across (0..1) and v down (0 = top, 1 = bottom)
// and returns an index into the sprite's palette (0 = transparent). `emit` lists palette
// indices that glow (ignore fog).

function demonPx(u, v, glint) {
  const du = Math.abs(u - 0.5);
  if (glint && Math.abs(u - 0.57) < 0.05 && Math.abs(v - 0.17) < 0.03) return 6;
  if (v < 0.13) { const hx = 0.16 + (0.13 - v) * 1.2; return Math.abs(du - hx) < 0.045 ? 3 : 0; } // horns
  if (v < 0.3) {
    if (du < 0.16) { if (v > 0.15 && v < 0.2 && Math.abs(du - 0.07) < 0.035) return 4; return du > 0.12 ? 2 : 1; }
    return 0;
  }
  if (v < 0.68) { const hw = 0.38 - (v - 0.3) * 0.35; if (du < hw) return du > hw - 0.07 ? 2 : 1; return 0; }
  return Math.abs(du - 0.12) < 0.08 ? 5 : 0; // legs
}

function robotPx(u, v, glint) {
  const du = Math.abs(u - 0.5);
  if (glint && du < 0.05 && Math.abs(v - 0.18) < 0.03) return 6;
  if (v < 0.1) { if (v < 0.03 && du < 0.035) return 4; return du < 0.015 ? 3 : 0; } // antenna
  if (v < 0.3) { if (du < 0.18) { if (v > 0.15 && v < 0.21 && du < 0.13) return 4; return du > 0.15 ? 2 : 1; } return 0; }
  if (v < 0.34) return du < 0.07 ? 2 : 0;
  if (v < 0.66) {
    if (du < 0.3) { if (v > 0.4 && v < 0.46 && du < 0.05) return 7; return du > 0.25 ? 2 : 1; }
    return du < 0.38 && v < 0.58 ? 2 : 0; // arms
  }
  return Math.abs(du - 0.13) < 0.07 ? 5 : 0;
}

function witchPx(u, v, glint) {
  const du = Math.abs(u - 0.5);
  if (glint && Math.abs(u - 0.55) < 0.05 && Math.abs(v - 0.34) < 0.03) return 6;
  if (v < 0.24) { // bent hat
    const lean = (0.24 - v) * 0.8 * (1 - v / 0.24);
    return Math.abs(u - 0.5 - lean) < v / 0.24 * 0.2 ? (v > 0.19 ? 5 : 1) : 0;
  }
  if (v < 0.29) return du < 0.3 ? 1 : 0; // brim
  if (v < 0.42) { // face + hair
    if (du < 0.12) return v > 0.33 && v < 0.36 && Math.abs(du - 0.05) < 0.025 ? 4 : 3;
    return du < 0.16 && v < 0.4 ? 2 : 0;
  }
  const hw = 0.16 + (v - 0.42) * 0.4;
  if (v > 0.55 && v < 0.6 && du > hw && du < hw + 0.07) return 3; // hands
  if (du < hw) return du > hw - 0.06 ? 2 : 1;                     // robe
  if (v > 0.45 && Math.abs(u - (0.88 - (v - 0.45) * 1.4)) < 0.025) return 7; // broom
  return 0;
}

export const PLAYER_SPRITES = {
  demon: { px: demonPx, emit: [4, 6], pal: [null, [150, 30, 25], [85, 14, 14], [205, 185, 150], [255, 220, 60], [35, 14, 14], [255, 255, 255]] },
  robot: { px: robotPx, emit: [4, 6, 7], pal: [null, [140, 150, 165], [70, 76, 88], [185, 190, 200], [255, 40, 30], [50, 54, 62], [255, 255, 255], [40, 220, 255]] },
  witch: { px: witchPx, emit: [4, 6], pal: [null, [34, 22, 44], [18, 12, 26], [95, 175, 70], [255, 240, 80], [150, 45, 190], [255, 255, 255], [120, 80, 40]] },
};

// --- pickups ---
function healthPx(u, v) {
  if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) return 0;
  if ((Math.abs(u - 0.5) < 0.14 && v > 0.18 && v < 0.82) || (Math.abs(v - 0.5) < 0.14 && u > 0.18 && u < 0.82)) return 3;
  return 1;
}

const gunCache = {};
function gunPx(w) {
  return gunCache[w] || (gunCache[w] = (u, v) => {
    if (w === 'sniper' && v > 0.12 && v < 0.3 && u > 0.35 && u < 0.65) return 2; // scope
    if (v > 0.3 && v < 0.55 && u > 0.08 && u < 0.82) return v > 0.4 && v < 0.45 && u > 0.15 && u < 0.75 ? 3 : 1;
    if (v > 0.36 && v < 0.48 && u >= 0.82) return 2;                               // barrel
    if (v >= 0.55 && v < 0.95 && u > 0.14 && u < 0.28) return 2;                   // grip
    if (w === 'smg' && v >= 0.55 && v < 0.9 && u > 0.45 && u < 0.56) return 2;     // long mag
    if (w === 'shotgun' && v >= 0.55 && v < 0.68 && u > 0.5 && u < 0.8) return 2;  // pump
    return 0;
  });
}

// world size + shape for a floating pickup
export function pickupSprite(weapon, color) {
  if (weapon === 'ammo') return AMMO_CRATE;
  if (weapon === 'health') return { w: 0.4, h: 0.4, px: healthPx, pal: [null, [235, 235, 235], null, [230, 30, 30]], emit: [1, 3] };
  return { w: 0.7, h: 0.35, px: gunPx(weapon), pal: [null, [70, 70, 78], [30, 30, 34], color], emit: [3] };
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
