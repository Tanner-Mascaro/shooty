// Billboard shapes. Each px(u, v, glint) takes u across (0..1) and v down (0 = top, 1 = bottom)
// and returns an index into the sprite's palette (0 = transparent). `emit` lists palette
// indices that glow (ignore fog).

// the player characters are pixel art in characters.js
import { PLAYER_SPRITES } from './characters.js';
export { PLAYER_SPRITES };

export const PLAYER_SKINS = Object.keys(PLAYER_SPRITES);
export const PLAYER_SKIN_NAMES = {
  witch: 'Swamp Witch', robotWitch: 'Robot Witch', gothicWitch: 'Gothic Witch',
  infernalWitch: 'Infernal Witch', iceWitch: 'Ice Witch', ghostWitch: 'Ghost Witch', plagueWitch: 'Plague Witch',
  zombie: 'Risen Corpse', mummy: 'Cursed Mummy', werewolf: 'Werewolf', vampire: 'Vampire Count', knight: 'Hexed Knight',
  ninja: 'Shadow Ninja', nun: 'Unholy Nun', demon: 'Brimstone Demon', slime: 'Cauldron Slime', goose: 'Familiar Goose',
};

// --- pickups ---
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
  // Hex Wand: a dark wooden shaft, a brass collar and a glowing gem
  wand: { w: 0.55, h: 0.2, boxes: [[0.04, 0.78, 0.4, 0.6, 4], [0.04, 0.24, 0.34, 0.66, 2], [0.76, 0.84, 0.28, 0.72, 1], [0.84, 0.98, 0.18, 0.82, 3]] },
  beam: { w: 0.95, h: 0.28, boxes: [[0.02, 0.22, 0.32, 0.72, 2], [0.22, 0.62, 0.26, 0.52, 1], [0.62, 0.88, 0.3, 0.46, 1],
    [0.88, 1, 0.34, 0.42, 3], [0.3, 0.42, 0.1, 0.24, 2], [0.45, 0.55, 0.52, 0.9, 2], [0.28, 0.78, 0.34, 0.4, 3],
    [0.7, 0.86, 0.18, 0.28, 3]] },
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
// health / potion / cauldron use Koalerina Cozy Witchcraft 32×32 PNGs (see /img/CREDITS.txt)
export function pickupSprite(weapon, color) {
  if (weapon === 'ammo') return AMMO_CRATE;
  if (weapon === 'nade') return NADE_SPRITE;
  if (weapon === 'health') return HEALTH_SPRITE;
  if (weapon === 'scroll') return SCROLL_SPRITE;
  const g = GUN_SHAPES[weapon] || GUN_SHAPES.pistol, body = color.map(c => 40 + c * 0.35); // each gun's body carries its color
  return { w: g.w, h: g.h, px: gunPx(weapon in GUN_SHAPES ? weapon : 'pistol'), pal: [null, body, [26, 26, 30], color, [110, 70, 40]], emit: [3] };
}

const HEALTH_SPRITE = { w: 0.55, h: 0.55, src: '/img/health-potion.png' };
// a rolled spell scroll with a violet seal
const SCROLL_SPRITE = {
  w: 0.55, h: 0.55, emit: [3],
  pal: [null, [230, 205, 150], [150, 110, 60], [190, 120, 255], [120, 80, 40]],
  px: function scroll(u, v) {
    const rolls = (u < 0.2 || u > 0.8) && v > 0.28 && v < 0.72;
    if (rolls) return (u < 0.1 || u > 0.9) ? 4 : 2;
    if (u >= 0.2 && u <= 0.8 && v > 0.34 && v < 0.66) {
      if (Math.hypot(u - 0.5, v - 0.5) < 0.1) return 3; // seal
      return ((v * 20) | 0) % 3 === 0 && u > 0.28 && u < 0.72 ? 4 : 1; // writing
    }
    return 0;
  },
};
const NADE_SPRITE = { w: 0.55, h: 0.55, src: '/img/potion.png' };
const AMMO_CRATE = { w: 0.5, h: 0.5, src: '/img/ammo.png' };

// --- loot cauldron billboard (Cozy Witchcraft 32×32 at /img/cauldron.png) ---
export function boxSprite() {
  return { w: 0.72, h: 0.72, src: '/img/cauldron.png' };
}
