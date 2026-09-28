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
};

export const unlockLevel = skin => SKIN_UNLOCKS[skin] || 1;
export const skinUnlocked = (skin, level) => unlockLevel(skin) <= level;

// skins that open up somewhere between two levels (for "level up — unlocked X")
export const skinsUnlockedBetween = (from, to) => Object.keys(SKIN_UNLOCKS).filter(s => SKIN_UNLOCKS[s] > from && SKIN_UNLOCKS[s] <= to);
