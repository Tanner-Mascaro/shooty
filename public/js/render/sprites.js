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

// Extra selectable characters share the same chunky billboard proportions, with a
// distinct silhouette or costume detail for each one.
function characterPx(kind) {
  return function (u, v, glint) {
    const du = Math.abs(u - 0.5), head = du < 0.15 && v > 0.16 && v < 0.38;
    const torsoWidth = kind === 'bodybuilder' ? 0.34 : kind === 'ghost' || kind === 'slime' ? 0.32 : 0.25;
    const torso = du < torsoWidth && v >= 0.39 && v < 0.74;
    const legs = v >= 0.72 && v < 0.98 && (Math.abs(u - 0.39) < 0.09 || Math.abs(u - 0.61) < 0.09);
    const arm = v > 0.43 && v < 0.68 && du > torsoWidth && du < torsoWidth + 0.13;
    if (glint && (kind === 'ghost' || kind === 'slime' || kind === 'astronaut') && du < 0.05 && Math.abs(v - 0.28) < 0.035) return 6;

    if (kind === 'goose') {
      if (v > 0.26 && v < 0.34 && u > 0.68 && u < 0.88) return 3; // orange beak
      if (v > 0.17 && v < 0.21 && u > 0.56 && u < 0.61) return 4; // eye
      if (v > 0.23 && v < 0.73 && du < 0.3 + (v > 0.58 ? (v - 0.58) * 0.4 : 0)) return v > 0.4 && v < 0.53 && du > 0.1 ? 2 : 1;
      if (v > 0.7 && v < 0.92 && (Math.abs(u - 0.42) < 0.035 || Math.abs(u - 0.58) < 0.035)) return 3;
      return 0;
    }
    if (kind === 'ghost' || kind === 'slime') {
      const edge = kind === 'ghost' ? 0.38 - Math.max(0, v - 0.72) * 0.35 + Math.sin(u * 30) * 0.025 : 0.33 * Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.52) / 0.48, 2)));
      if (v > (kind === 'ghost' ? 0.08 : 0.12) && v < 0.98 && du < edge) {
        if (v > 0.31 && v < 0.37 && (Math.abs(u - 0.4) < 0.035 || Math.abs(u - 0.6) < 0.035)) return 4;
        if (v > 0.68 && Math.sin(u * 36) > 0.45) return 2;
        return glint && du < 0.08 && v < 0.27 ? 6 : (du > edge - 0.07 ? 2 : 1);
      }
      if (kind === 'slime' && v > 0.06 && v < 0.15 && du < 0.14) return 3;
      return 0;
    }

    // Signature headwear, masks and head shapes.
    if (kind === 'cowboy' && v < 0.2 && v > 0.1 && du < 0.34) return v < 0.16 && du < 0.16 ? 3 : 5;
    if (kind === 'nun' && v < 0.25 && v > 0.12 && du < 0.26) return du < 0.14 && v > 0.17 ? 4 : 1;
    if (kind === 'knight' && v < 0.35 && du < 0.2) return v < 0.14 && du < 0.08 ? 3 : v > 0.23 && v < 0.28 ? 4 : 1;
    if (kind === 'construction' && v < 0.2 && v > 0.12 && du < 0.24) return v < 0.16 ? 3 : 5;
    if (kind === 'superhero' && v < 0.17 && v > 0.08 && du < 0.21) return 3;
    if (kind === 'ninja' && v < 0.25 && v > 0.13 && du < 0.2) return v > 0.2 && du < 0.11 ? 4 : 1;
    if (kind === 'werewolf' && v < 0.2 && v > 0.03 && (Math.abs(u - 0.35) < 0.07 || Math.abs(u - 0.65) < 0.07)) return 3;
    if (kind === 'zombie' && v < 0.15 && du < 0.13 && Math.sin(u * 45) > 0) return 2;
    if (kind === 'astronaut' && v < 0.42 && du < 0.22) return v < 0.16 || v > 0.36 || du > 0.17 ? 5 : 4;
    if (kind === 'mummy' && head && Math.sin((u + v) * 90) > 0.2) return 5;
    if (kind === 'vampire' && v < 0.3 && v > 0.1 && du < 0.2) return v < 0.19 && du > 0.12 ? 3 : 4;
    if (head) {
      if (v > 0.26 && v < 0.3 && du < 0.1) return kind === 'vampire' ? 3 : kind === 'zombie' ? 3 : 4;
      return kind === 'bodybuilder' ? 4 : 4;
    }

    // Costume shapes and signature marks.
    if (kind === 'nun' && v > 0.34 && v < 0.82 && du > 0.25 && du < 0.34) return 1; // veil
    if (kind === 'knight' && torso && du < 0.06 && v > 0.48 && v < 0.63) return 4; // cross on the armor
    if (kind === 'bodybuilder' && torso && v > 0.53 && v < 0.58 && du < 0.24) return 4; // chest
    if (kind === 'construction' && torso && (du < 0.06 || (v > 0.58 && v < 0.63))) return 3; // safety vest
    if (kind === 'superhero' && v > 0.32 && v < 0.79 && du > 0.24 && du < 0.4) return 2; // cape
    if (kind === 'superhero' && torso && v > 0.48 && v < 0.58 && du < 0.09) return 3; // chest emblem
    if (kind === 'werewolf' && torso && v > 0.46 && v < 0.52 && du > 0.13) return 4; // claws
    if (kind === 'zombie' && torso && Math.sin(u * 25 + v * 18) > 0.86) return 4; // torn patches
    if (kind === 'astronaut' && torso && v > 0.55 && v < 0.63 && du < 0.1) return 6; // control panel
    if (kind === 'mummy' && (torso || legs || arm) && Math.sin((u * 9 + v * 5) * Math.PI) > 0.35) return 4;
    if (kind === 'vampire' && v > 0.37 && v < 0.83 && du > 0.23 && du < 0.39) return 3; // cape
    if (torso) return (kind === 'knight' && du > 0.19) || (kind === 'construction' && du > 0.19) ? 2 : 1;
    if (arm) return 2;
    if (legs) return 2;
    if (kind === 'werewolf' && v < 0.16 && du < 0.17) return 3;
    return 0;
  };
}

export const PLAYER_SPRITES = {
  demon: { px: demonPx, emit: [4, 6], pal: [null, [150, 30, 25], [85, 14, 14], [205, 185, 150], [255, 220, 60], [35, 14, 14], [255, 255, 255]] },
  robot: { px: robotPx, emit: [4, 6, 7], pal: [null, [140, 150, 165], [70, 76, 88], [185, 190, 200], [255, 40, 30], [50, 54, 62], [255, 255, 255], [40, 220, 255]] },
  witch: { px: witchPx, emit: [4, 6], pal: [null, [34, 22, 44], [18, 12, 26], [95, 175, 70], [255, 240, 80], [150, 45, 190], [255, 255, 255], [120, 80, 40]] },
  cowboy: { px: characterPx('cowboy'), emit: [], pal: [null, [125, 71, 34], [75, 39, 22], [65, 36, 20], [235, 184, 135], [218, 166, 59]] },
  nun: { px: characterPx('nun'), emit: [], pal: [null, [230, 228, 216], [50, 42, 55], [25, 22, 30], [224, 178, 140], [177, 176, 165]] },
  knight: { px: characterPx('knight'), emit: [], pal: [null, [120, 132, 150], [58, 67, 82], [180, 70, 55], [230, 200, 130], [190, 200, 210]] },
  bodybuilder: { px: characterPx('bodybuilder'), emit: [], pal: [null, [190, 50, 42], [95, 30, 30], [230, 160, 115], [255, 210, 165]] },
  ghost: { px: characterPx('ghost'), emit: [6], pal: [null, [150, 220, 235], [82, 150, 180], [190, 245, 255], [30, 48, 70], null, [255, 255, 255]] },
  goose: { px: characterPx('goose'), emit: [], pal: [null, [238, 236, 218], [165, 163, 150], [235, 135, 30], [35, 35, 30]] },
  construction: { px: characterPx('construction'), emit: [], pal: [null, [55, 90, 62], [40, 52, 48], [245, 184, 35], [225, 174, 130], [234, 132, 28]] },
  superhero: { px: characterPx('superhero'), emit: [], pal: [null, [35, 88, 185], [25, 45, 110], [225, 45, 45], [240, 190, 145]] },
  ninja: { px: characterPx('ninja'), emit: [], pal: [null, [32, 37, 48], [15, 18, 27], [170, 35, 42], [230, 205, 170]] },
  werewolf: { px: characterPx('werewolf'), emit: [], pal: [null, [100, 82, 72], [47, 40, 38], [188, 160, 133], [225, 220, 195]] },
  zombie: { px: characterPx('zombie'), emit: [], pal: [null, [80, 112, 64], [45, 65, 42], [190, 55, 45], [125, 145, 89]] },
  astronaut: { px: characterPx('astronaut'), emit: [6], pal: [null, [205, 210, 218], [115, 128, 145], [210, 55, 45], [95, 165, 195], [246, 248, 255], [70, 230, 255]] },
  mummy: { px: characterPx('mummy'), emit: [], pal: [null, [190, 174, 132], [110, 98, 75], [70, 56, 44], [235, 220, 175], [220, 205, 165]] },
  vampire: { px: characterPx('vampire'), emit: [], pal: [null, [55, 22, 48], [28, 12, 32], [155, 24, 42], [228, 202, 190]] },
  slime: { px: characterPx('slime'), emit: [6], pal: [null, [80, 195, 78], [42, 120, 50], [170, 245, 100], [35, 65, 30], null, [230, 255, 190]] },
};

export const PLAYER_SKINS = Object.keys(PLAYER_SPRITES);
export const PLAYER_SKIN_NAMES = {
  demon: 'Demon', robot: 'Robot', witch: 'Witch', cowboy: 'Cowboy', nun: 'Nun', knight: 'Knight',
  bodybuilder: 'Bodybuilder', ghost: 'Ghost', goose: 'Goose', construction: 'Construction worker',
  superhero: 'Superhero', ninja: 'Ninja', werewolf: 'Werewolf', zombie: 'Zombie', astronaut: 'Astronaut',
  mummy: 'Mummy', vampire: 'Vampire', slime: 'Slime',
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

// --- haunted house creature: a tall, gaunt shadow with long arms, hollow glowing eyes and a
// grin too wide for its face. The eyes and grin glow through the dark; `hunting` makes them red.
function creaturePx(u, v) {
  const du = Math.abs(u - 0.5);
  if (v < 0.27) { // head
    const hx = 0.17 - Math.max(0, 0.08 - v) * 0.8, dy = (v - 0.15) / 0.13;
    if (du > hx * Math.sqrt(Math.max(0, 1 - dy * dy)) + 0.01) return 0;
    if (Math.abs(du - 0.07) < 0.03 && Math.abs(v - 0.13) < 0.028) return 3;            // eyes
    if (v > 0.19 && v < 0.235 && du < 0.13 - (v - 0.19) * 1.2) return (u * 40 | 0) % 2 ? 4 : 2; // grin with teeth
    return 1;
  }
  if (v < 0.31) return du < 0.05 ? 1 : 0;                                              // neck
  const shoulders = 0.2 - Math.max(0, v - 0.36) * 0.12;
  if (v < 0.72 && du < shoulders) return du > shoulders - 0.03 ? 2 : 1;                 // body
  const armX = 0.24 + (v - 0.31) * 0.08, wisp = Math.sin(v * 40 + u * 7) * 0.01;
  if (v < 0.94 && Math.abs(du - armX) < 0.025 + wisp) return 1;                         // long arms
  if (v >= 0.94 && v < 0.99 && Math.abs(du - armX) < 0.05 && ((u * 60) | 0) % 2) return 2; // claws
  if (v >= 0.72 && Math.abs(du - 0.08) < 0.035 + (1 - v) * 0.05) return 1;              // legs
  return 0;
}
const CREATURE_SPRITES = {};
export function creatureSprite(hunting) {
  return CREATURE_SPRITES[hunting] ??= { w: 0.8, h: 1.15, px: creaturePx, emit: [3, 4],
    pal: [null, [10, 8, 12], [34, 30, 40], hunting ? [255, 60, 40] : [255, 250, 225], hunting ? [255, 200, 190] : [240, 235, 215]] };
}
