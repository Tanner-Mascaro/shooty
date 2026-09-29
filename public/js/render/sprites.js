// Billboard shapes. Each px(u, v, glint) takes u across (0..1) and v down (0 = top, 1 = bottom)
// and returns an index into the sprite's palette (0 = transparent). `emit` lists palette
// indices that glow (ignore fog).

// the player characters are pixel art in characters.js
import { PLAYER_SPRITES, spriteFor, wearsHats } from './characters.js';
export { PLAYER_SPRITES, spriteFor, wearsHats };
// a player's look for spriteFor: their skin, with their hat on if they wear one
export const lookOf = p => p && (p.hat && p.hat !== 'none' && wearsHats(p.skin) ? p.skin + '@' + p.hat : p.skin);

export const PLAYER_SKINS = Object.keys(PLAYER_SPRITES);
export const PLAYER_SKIN_NAMES = {
  witch: 'Swamp Witch', robotWitch: 'Robot Witch', gothicWitch: 'Gothic Witch',
  infernalWitch: 'Infernal Witch', iceWitch: 'Ice Witch', ghostWitch: 'Ghost Witch', plagueWitch: 'Plague Witch',
  zombie: 'Risen Corpse', mummy: 'Cursed Mummy', werewolf: 'Werewolf', vampire: 'Vampire Count', knight: 'Hexed Knight',
  ninja: 'Shadow Ninja', nun: 'Unholy Nun', demon: 'Brimstone Demon', slime: 'Cauldron Slime', goose: 'Familiar Goose',
  cowboy: 'Gunslinger', construction: 'Tower Mason', robot: 'Clockwork Golem', ghost: 'Friendly Phantom',
  bodybuilder: 'Iron Brute', astronaut: 'Star Voyager', superhero: 'Caped Crusader',
  pirateWitch: 'Pirate Witch', skeleton: 'Bone Deckhand', scarecrow: 'Scarecrow', reaper: 'Grim Reaper', stitched: 'Stitched Brute',
  pumpkinKing: 'Pumpkin King', snowman: 'Frost Snowman', seaWitch: 'Sea Witch', captain: 'Ghost Captain',
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
  // held only (never a pickup): wooden grip, dark guard, steel blade
  blade: { w: 0.55, h: 0.16, boxes: [[0, 0.26, 0.35, 0.65, 4], [0.26, 0.32, 0.1, 0.9, 2], [0.32, 0.94, 0.3, 0.7, 1], [0.94, 1, 0.4, 0.6, 1], [0.32, 0.94, 0.3, 0.4, 3]] },
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
  // --- the newer guns ---
  derringer: { w: 0.26, h: 0.22, boxes: [[0.1, 0.95, 0.15, 0.35, 1], [0.1, 0.95, 0.35, 0.5, 2], [0.05, 0.35, 0.5, 0.98, 4], [0.35, 0.5, 0.5, 0.65, 2], [0.2, 0.8, 0.2, 0.28, 3]] },
  flintlock: { w: 0.62, h: 0.3, boxes: [[0.25, 1, 0.2, 0.36, 2], [0.2, 0.5, 0.18, 0.5, 1], [0.02, 0.3, 0.4, 0.95, 4], [0.28, 0.4, 0.05, 0.22, 2],
    [0.4, 0.5, 0.5, 0.66, 2], [0.94, 1, 0.14, 0.4, 2], [0.3, 0.9, 0.22, 0.28, 3]] },
  autopistol: { w: 0.4, h: 0.34, boxes: [[0.05, 0.95, 0.1, 0.38, 1], [0.12, 0.88, 0.2, 0.27, 3], [0.1, 0.34, 0.38, 0.8, 2], [0.34, 0.5, 0.38, 0.55, 2],
    [0.14, 0.3, 0.8, 1, 2], [0.14, 0.3, 0.92, 1, 3], [0.88, 1, 0.14, 0.3, 2]] },
  assault: { w: 0.86, h: 0.38, boxes: [[0, 0.2, 0.28, 0.66, 4], [0.2, 0.58, 0.22, 0.5, 1], [0.58, 0.82, 0.26, 0.44, 4], [0.82, 1, 0.32, 0.4, 2],
    [0.42, 0.52, 0.5, 0.96, 2], [0.47, 0.56, 0.9, 1, 3], [0.27, 0.35, 0.5, 0.86, 2], [0.22, 0.78, 0.33, 0.38, 3], [0.74, 0.78, 0.14, 0.26, 2]] },
  dmr: { w: 0.9, h: 0.32, boxes: [[0, 0.22, 0.34, 0.74, 2], [0.22, 0.6, 0.3, 0.54, 1], [0.6, 0.86, 0.34, 0.48, 1], [0.86, 1, 0.38, 0.45, 2],
    [0.3, 0.52, 0.12, 0.28, 2], [0.32, 0.5, 0.14, 0.2, 3], [0.4, 0.5, 0.54, 0.8, 2], [0.26, 0.34, 0.54, 0.88, 2], [0.24, 0.8, 0.4, 0.45, 3]] },
  marksman: { w: 1.0, h: 0.3, boxes: [[0, 0.24, 0.36, 0.78, 4], [0.24, 0.54, 0.36, 0.58, 1], [0.54, 1, 0.43, 0.5, 2], [0.28, 0.54, 0.1, 0.26, 2],
    [0.3, 0.52, 0.12, 0.18, 3], [0.36, 0.44, 0.58, 0.82, 2], [0.28, 0.34, 0.58, 0.86, 2], [0.26, 0.9, 0.45, 0.49, 3]] },
  dragon: { w: 1.25, h: 0.36, boxes: [[0, 0.22, 0.34, 0.8, 2], [0.22, 0.52, 0.3, 0.6, 1], [0.52, 1, 0.4, 0.5, 2], [0.94, 1, 0.34, 0.56, 1],
    [0.24, 0.56, 0.04, 0.24, 2], [0.26, 0.54, 0.08, 0.16, 3], [0.6, 0.64, 0.5, 0.95, 2], [0.7, 0.74, 0.5, 0.95, 2], [0.24, 0.92, 0.44, 0.47, 3]] },
  doublebarrel: { w: 0.92, h: 0.3, boxes: [[0, 0.3, 0.32, 0.8, 4], [0.3, 0.44, 0.24, 0.56, 1], [0.44, 1, 0.22, 0.34, 2], [0.44, 1, 0.36, 0.48, 2],
    [0.5, 0.74, 0.48, 0.6, 4], [0.32, 0.4, 0.56, 0.86, 4], [0.3, 0.42, 0.3, 0.38, 3]] },
  autoshotgun: { w: 0.86, h: 0.4, boxes: [[0, 0.2, 0.26, 0.66, 2], [0.2, 0.62, 0.2, 0.5, 1], [0.62, 1, 0.24, 0.38, 2], [0.62, 0.9, 0.4, 0.5, 2],
    [0.36, 0.56, 0.5, 0.78, 1], [0.36, 0.56, 0.72, 0.8, 3], [0.24, 0.32, 0.5, 0.86, 2], [0.22, 0.6, 0.3, 0.36, 3]] },
  blunderbuss: { w: 0.9, h: 0.36, boxes: [[0, 0.32, 0.36, 0.84, 4], [0.32, 0.76, 0.34, 0.5, 1], [0.76, 0.9, 0.3, 0.54, 1], [0.9, 1, 0.2, 0.64, 1],
    [0.92, 1, 0.3, 0.54, 2], [0.36, 0.46, 0.5, 0.7, 2], [0.34, 0.74, 0.38, 0.42, 3]] },
  gatling: { w: 0.95, h: 0.46, boxes: [[0, 0.16, 0.2, 0.5, 2], [0.16, 0.48, 0.14, 0.56, 1], [0.48, 1, 0.18, 0.26, 2], [0.48, 1, 0.3, 0.38, 2],
    [0.48, 1, 0.42, 0.5, 2], [0.94, 1, 0.14, 0.54, 1], [0.22, 0.42, 0.56, 1, 2], [0.22, 0.42, 0.9, 1, 3], [0.18, 0.46, 0.3, 0.36, 3], [0.26, 0.4, 0.02, 0.14, 2]] },
  reaper: { w: 0.52, h: 0.38, boxes: [[0, 0.14, 0.24, 0.32, 2], [0.14, 0.8, 0.14, 0.46, 1], [0.8, 0.98, 0.24, 0.36, 2], [0.4, 0.5, 0.46, 0.98, 2],
    [0.4, 0.5, 0.9, 0.98, 3], [0.2, 0.3, 0.46, 0.84, 2], [0.18, 0.76, 0.26, 0.32, 3], [0.55, 0.78, 0.46, 0.6, 2]] },
  swarm: { w: 0.6, h: 0.34, boxes: [[0, 0.3, 0.3, 0.8, 1], [0.3, 0.88, 0.2, 0.56, 1], [0.88, 1, 0.34, 0.44, 2], [0.2, 0.9, 0.08, 0.2, 2],
    [0.22, 0.88, 0.1, 0.16, 3], [0.38, 0.5, 0.56, 0.9, 2], [0.56, 0.8, 0.56, 0.7, 2]] },
  tommy: { w: 0.8, h: 0.44, boxes: [[0, 0.2, 0.26, 0.6, 4], [0.2, 0.62, 0.2, 0.44, 1], [0.62, 1, 0.26, 0.36, 2], [0.62, 0.78, 0.36, 0.44, 2],
    [0.36, 0.56, 0.44, 0.96, 2], [0.38, 0.54, 0.5, 0.9, 3], [0.62, 0.72, 0.44, 0.7, 4], [0.24, 0.32, 0.44, 0.8, 4]] },
  staff: { w: 1.0, h: 0.26, boxes: [[0, 0.82, 0.42, 0.58, 4], [0.1, 0.14, 0.36, 0.64, 2], [0.4, 0.44, 0.36, 0.64, 2], [0.8, 0.86, 0.2, 0.8, 1],
    [0.86, 1, 0.1, 0.9, 3], [0.9, 0.96, 0.3, 0.7, 1]] },
  bow: { w: 0.95, h: 0.5, boxes: [[0.05, 0.42, 0.42, 0.62, 4], [0.42, 0.7, 0.4, 0.6, 1], [0.7, 0.76, 0.02, 0.98, 4], [0.66, 0.7, 0.06, 0.2, 2],
    [0.66, 0.7, 0.8, 0.94, 2], [0.64, 0.66, 0.1, 0.9, 3], [0.2, 0.98, 0.48, 0.52, 3], [0.94, 1, 0.44, 0.56, 1]] },
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
export function pickupSprite(weapon, color, spell) {
  if (weapon === 'ammo') return AMMO_CRATE;
  if (weapon === 'nade') return NADE_SPRITE;
  if (weapon === 'health') return HEALTH_SPRITE;
  if (weapon === 'scroll') return spellPotion(spell) || { w: 0.5, h: 0.5, src: '/img/potion.png' };
  const g = GUN_SHAPES[weapon] || GUN_SHAPES.pistol, body = color.map(c => 40 + c * 0.35); // each gun's body carries its color
  return { w: g.w, h: g.h, px: gunPx(weapon in GUN_SHAPES ? weapon : 'pistol'), pal: [null, body, [26, 26, 30], color, [110, 70, 40]], emit: [3] };
}

const HEALTH_SPRITE = { w: 0.55, h: 0.55, src: '/img/health-potion.png' };
// spells come in potions: the violet potion (/img/potion.png), its brew recolored to each
// spell's color. null until the picture has loaded
const potionImg = typeof Image !== 'undefined' ? new Image() : null;
if (potionImg) potionImg.src = '/img/potion.png';
// (keep in step with SPELL_LOOK in constants.js)
const SPELL_COLORS = { heal: [230, 60, 70], haste: [255, 210, 60], ward: [70, 110, 255], broom: [255, 140, 40], blink: [60, 230, 220],
  invis: [200, 200, 230], curse: [190, 70, 255], frost: [190, 235, 255], totem: [40, 190, 90], well: [110, 60, 200], decoy: [255, 120, 190] };
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const potionArts = {};
export function spellPotion(spell) {
  if (!potionImg || !potionImg.complete || !potionImg.naturalWidth) return null;
  if (potionArts[spell]) return potionArts[spell];
  const c = document.createElement('canvas'), W = c.width = potionImg.naturalWidth, H = c.height = potionImg.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(potionImg, 0, 0);
  const img = g.getImageData(0, 0, W, H), d = img.data, [th, ts] = hsl(SPELL_COLORS[spell] || [190, 120, 255]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [h, s, l] = hsl([d[i], d[i + 1], d[i + 2]]);
    if (s < 0.2 || h < 0.62 || h > 0.97) continue; // only the violet brew (and its sparkles), not the cork or glass
    d.set(rgb([th, Math.min(1, ts * 0.85 + s * 0.15), l]).map(Math.round), i);
  }
  g.putImageData(img, 0, 0);
  return potionArts[spell] = { w: 0.5, h: 0.5, canvas: c };
}
const NADE_SPRITE = { w: 0.55, h: 0.55, src: '/img/potion.png' };
const AMMO_CRATE = { w: 0.5, h: 0.5, src: '/img/ammo.png' };

// --- loot cauldron billboard (Cozy Witchcraft 32×32 at /img/cauldron.png) ---
export function boxSprite() {
  return { w: 0.72, h: 0.72, src: '/img/cauldron.png' };
}
