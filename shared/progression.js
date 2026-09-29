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
  pirateWitch: 21, skeleton: 23, scarecrow: 25, reaper: 28, stitched: 30, pumpkinKing: 33, snowman: 36, seaWitch: 40, captain: 45,
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
  // these have their own motion as well as color (public/js/particles.js killEffect)
  petals: { name: 'Rose Petals', level: 16, color: [230, 60, 90], style: 'petals' },
  bubbles: { name: 'Sea Spray', level: 18, color: [120, 200, 255], style: 'bubbles' },
  confetti: { name: 'Confetti', level: 20, color: [255, 220, 90], style: 'confetti' },
  lightning: { name: 'Thunderclap', level: 23, color: [210, 230, 255], style: 'lightning' },
  souls: { name: 'Departing Soul', level: 26, color: [160, 255, 220], style: 'souls' },
  bats: { name: 'Bat Swarm', level: 30, color: [50, 30, 60], style: 'bats' },
  rainbow: { name: 'Hexed Rainbow', level: 35, color: [255, 120, 200], style: 'rainbow' },
};
export const titleOk = (id, level) => !!TITLES[id] && TITLES[id].level <= level;
export const effectOk = (id, level) => !!KILL_EFFECTS[id] && KILL_EFFECTS[id].level <= level;
// "Level 5 — Cauldron Keeper title, Violet Sparks" for level-up banners
export const unlocksAt = level => [
  ...Object.values(TITLES).filter(t => t.level === level).map(t => t.name + ' title'),
  ...Object.values(KILL_EFFECTS).filter(k => k.level === level).map(k => k.name + ' kills'),
  ...Object.values(HATS).filter(h => h.level === level && level > 1).map(h => h.name + ' hat'),
  ...Object.values(FAMILIARS).filter(f => f.level === level && level > 1).map(f => f.name + ' familiar'),
];

// Feats: lifetime goals that never reset. Each counts one of the numbers kept on your profile's
// meta (server/hub.js cleanMeta) and unlocks a hat for good.
const weaponKills = (...ids) => m => ids.reduce((n, id) => n + (m.weapons?.[id] || 0), 0);
export const FEATS = {
  wave10: { text: 'Reach wave 10 in Wave Survival', goal: 10, n: m => m.best?.wave || 0 },
  bosses: { text: 'Slay 10 survival bosses (Brutes, Captains and worse)', goal: 10, n: m => m.bosses || 0 },
  mobs: { text: 'Kill 500 monsters in Wave Survival', goal: 500, n: m => m.mobs || 0 },
  wave20: { text: 'Reach wave 20 in Wave Survival', goal: 20, n: m => m.best?.wave || 0 },
  streak10: { text: 'Get a 10-kill streak', goal: 10, n: m => m.best?.streak || 0 },
  heads: { text: 'Land 100 headshot kills', goal: 100, n: m => m.heads || 0 },
  snipe: { text: 'Get 100 kills with sniper or beam rifles', goal: 100, n: weaponKills('sniper', 'crossbow', 'beam', 'marksman', 'dragon', 'dmr') },
  blade: { text: 'Get 50 blade kills', goal: 50, n: weaponKills('blade') },
  potion: { text: 'Get 25 potion kills', goal: 25, n: weaponKills('nade') },
  wins: { text: 'Win 25 matches', goal: 25, n: m => m.wins || 0 },
  matches: { text: 'Finish 50 matches', goal: 50, n: m => m.matches || 0 },
  modes: { text: 'Win in 6 different modes', goal: 6, n: m => Object.keys(m.modeWins || {}).length },
  kraken: { text: 'Slay the Kraken', goal: 1, n: m => m.krakens || 0 },
  gilded: { text: 'Earn Gold camo on 3 guns', goal: 3, n: m => goldGuns(m.weapons) },
};
export const featDone = (id, meta) => !!FEATS[id] && !!meta && FEATS[id].n(meta) >= FEATS[id].goal;
// what a feat unlocks: a hat or a familiar, by name
export const featReward = id => {
  const hat = Object.values(HATS).find(h => h.feat === id), pet = Object.values(FAMILIARS).find(f => f.feat === id);
  return hat ? hat.name + ' hat' : pet ? pet.name + ' familiar' : null;
};
// what the browser shows: [{ id, text, goal, n, done, reward }]
export const featView = meta => Object.entries(FEATS).map(([id, f]) => {
  const n = Math.min(f.goal, f.n(meta));
  return { id, text: f.text, goal: f.goal, n, done: n >= f.goal, reward: featReward(id) };
});

// Hats go on the seven witches in place of the one they come with ('none' keeps it).
// Some unlock with levels, the rest with feats. The art is in public/js/render/characters.js.
export const HATS = {
  none: { name: 'Her own hat', level: 1 },
  classic: { name: 'Classic Pointy', level: 1 },
  crooked: { name: 'Coven Crook', level: 3 },
  pumpkin: { name: "Jack-o'-Lantern", level: 6 },
  mushroom: { name: 'Toadstool', level: 9 },
  tophat: { name: 'Top Hat', level: 12 },
  candle: { name: 'Candle Stub', level: 16 },
  frog: { name: 'Frog Familiar', feat: 'wave10' },
  crown: { name: "Vampire Lord's Crown", feat: 'bosses' },
  bat: { name: 'Bat Perch', feat: 'mobs' },
  skull: { name: 'Crypt Skull', feat: 'wave20' },
  horns: { name: 'Devil Horns', feat: 'streak10' },
  antlers: { name: 'Antlers', feat: 'heads' },
  beret: { name: "Sharpshooter's Beret", feat: 'snipe' },
  arrow: { name: 'Arrow Through the Head', feat: 'blade' },
  cauldron: { name: 'Tiny Cauldron', feat: 'potion' },
  halo: { name: 'Halo', feat: 'wins' },
  cone: { name: 'Traffic Cone', feat: 'matches' },
  wizard: { name: 'Starry Wizard Hat', feat: 'modes' },
};
export const hatOk = (id, level, meta) => {
  const h = HATS[id];
  return !!h && (h.feat ? featDone(h.feat, meta) : h.level <= level);
};
// "Level 6" or the feat's goal, for locked hat cards and toasts
export const hatNeeds = id => HATS[id]?.feat ? FEATS[HATS[id].feat].text : 'Level ' + (HATS[id]?.level || 1);
// feats a change in meta just completed (for "feat done — hat unlocked")
export const featsDoneBetween = (before, after) => Object.keys(FEATS).filter(id => !featDone(id, before) && featDone(id, after));

// Camos: every gun earns its own finishes from the kills you make with it (profile meta.weapons);
// Obsidian opens up for every gun once ten of them have gone gold. Colors: render/gunModels.js
export const CAMOS = {
  bronze: { name: 'Bronze', kills: 25 },
  silver: { name: 'Silver', kills: 75 },
  gold: { name: 'Gold', kills: 150 },
  hex: { name: 'Hexed', kills: 300 },
  ghost: { name: 'Ghostflame', kills: 500 },
  obsidian: { name: 'Obsidian', goldGuns: 10 },
};
const TIERS = ['bronze', 'silver', 'gold', 'hex', 'ghost'];
// the camo choices: 'best' shows each gun's best tier, 'none' plain steel, or one camo everywhere it's earned
export const CAMO_CHOICES = ['best', 'none', ...Object.keys(CAMOS)];
export const goldGuns = weapons => Object.values(weapons || {}).filter(n => n >= CAMOS.gold.kills).length;
export const camoUnlocked = (camo, kills, gold) => camo === 'obsidian' ? gold >= CAMOS.obsidian.goldGuns : !!CAMOS[camo] && (kills || 0) >= CAMOS[camo].kills;
const bestTier = kills => TIERS.filter(t => (kills || 0) >= CAMOS[t].kills).pop() || null;
// the camo a gun shows for a player's choice (null: plain); a camo that gun hasn't earned falls back to its best
export function camoOf(choice, weapon, weapons) {
  if (choice === 'none') return null;
  const kills = weapons?.[weapon] || 0;
  if (choice !== 'best' && camoUnlocked(choice, kills, goldGuns(weapons))) return choice;
  return bestTier(kills);
}
// every gun a player has a camo showing on: { weapon: camo }
export const camoMap = (choice, weapons) => Object.fromEntries(Object.keys(weapons || {}).map(w => [w, camoOf(choice, w, weapons)]).filter(([, c]) => c));
// the next tier a gun is working toward, for the picker: { camo, need } or null
export const nextCamo = kills => { const t = TIERS.find(t => (kills || 0) < CAMOS[t].kills); return t ? { camo: t, need: CAMOS[t].kills } : null; };

// Familiars: a little pet that follows you about (art: public/js/render/pets.js)
export const FAMILIARS = {
  none: { name: 'No familiar', level: 1 },
  cat: { name: 'Black Cat', level: 2 },
  bat: { name: 'Bat', level: 6 },
  frog: { name: 'Frog', level: 10 },
  crow: { name: 'Crow', level: 15 },
  owl: { name: 'Owl', level: 19 },
  wisp: { name: "Will-o'-Wisp", level: 24 },
  skull: { name: 'Floating Skull', level: 29 },
  pumpkin: { name: 'Hopping Pumpkin', level: 34 },
  kraken: { name: 'Mini Kraken', feat: 'kraken' },
  goldCrow: { name: 'Gilded Crow', feat: 'gilded' },
};
export const petOk = (id, level, meta) => {
  const f = FAMILIARS[id];
  return !!f && (f.feat ? featDone(f.feat, meta) : f.level <= level);
};
export const petNeeds = id => FAMILIARS[id]?.feat ? FEATS[FAMILIARS[id].feat].text : 'Level ' + (FAMILIARS[id]?.level || 1);
