// XP, levels and skin unlocks, shared by the server (which awards XP and refuses locked skins)
// and the browser (profile bar, locked cards in the character picker).

// XP for what you do in a match (vs bots too — most play is vs bots)
export const XP = { kill: 10, match: 15, win: 35 };

// level n -> n+1 costs 100 + 60 per level already reached: 100, 160, 220, …
const step = level => 100 + 60 * (level - 1);

// total XP needed to reach a level (level 1 = 0)
export function xpForLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l++) total += step(l);
  return total;
}

// { level, into, need }: your level, XP into it, and XP the next level costs
export function levelInfo(xp) {
  let level = 1, left = Math.max(0, xp | 0);
  while (left >= step(level)) { left -= step(level); level++; }
  return { level, into: left, need: step(level) };
}

export const levelFor = xp => levelInfo(xp).level;

// the level each skin unlocks at; skins not listed are free from the start
export const SKIN_UNLOCKS = {
  zombie: 2, mummy: 3, werewolf: 4, vampire: 5, knight: 6,
  ninja: 7, nun: 8, demon: 9, slime: 10, goose: 12,
  cowboy: 13, construction: 14, robot: 16, ghost: 17, bodybuilder: 18, astronaut: 19, superhero: 20,
};

export const unlockLevel = skin => SKIN_UNLOCKS[skin] || 1;
export const skinUnlocked = (skin, level) => unlockLevel(skin) <= level;

// skins that open up somewhere between two levels (for "level up — unlocked X")
export const skinsUnlockedBetween = (from, to) => Object.keys(SKIN_UNLOCKS).filter(s => SKIN_UNLOCKS[s] > from && SKIN_UNLOCKS[s] <= to);

// titles shown under your name, and the burst your kills leave; both unlock with levels
export const TITLES = {
  apprentice: { name: 'Apprentice', level: 1 }, hedge: { name: 'Hedge Witch', level: 2 },
  hexbreaker: { name: 'Hexbreaker', level: 3 }, keeper: { name: 'Cauldron Keeper', level: 5 },
  grave: { name: 'Grave Dancer', level: 7 }, elder: { name: 'Coven Elder', level: 9 },
  hunter: { name: 'Witch Hunter', level: 11 }, queen: { name: 'Night Queen', level: 13 },
  arch: { name: 'Archwitch', level: 15 }, eternal: { name: 'The Eternal', level: 20 },
};
// kill effects: the color of the burst where your victim falls (blood is everyone's default)
export const KILL_EFFECTS = {
  blood: { name: 'Blood', level: 1, color: null }, emerald: { name: 'Emerald Smoke', level: 3, color: [80, 220, 110] },
  violet: { name: 'Violet Sparks', level: 5, color: [180, 110, 255] }, ember: { name: 'Hellfire', level: 7, color: [255, 120, 30] },
  frost: { name: 'Frost', level: 9, color: [140, 210, 255] }, shadow: { name: 'Shadow', level: 11, color: [40, 20, 60] },
  gold: { name: 'Gilded', level: 14, color: [255, 210, 80] },
};
export const titleOk = (id, level) => !!TITLES[id] && TITLES[id].level <= level;
export const effectOk = (id, level) => !!KILL_EFFECTS[id] && KILL_EFFECTS[id].level <= level;
// "Level 5 — Cauldron Keeper title, Violet Sparks" for level-up banners
export const unlocksAt = level => [
  ...Object.values(TITLES).filter(t => t.level === level).map(t => t.name + ' title'),
  ...Object.values(KILL_EFFECTS).filter(k => k.level === level).map(k => k.name + ' kills'),
];
