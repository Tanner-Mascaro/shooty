// Lobby room panel: room code + invite link, quick play / new private room, mode, teams,
// who's here and ready, bots, and the ready button.
// Switching rooms reloads the page with a new ?room= code; your profile survives the reload.
import { WIN_SCORE, TEAM_WIN_SCORE, HARDPOINT_SCORE_LIMIT, HARDPOINT_MATCH_MS, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, isTeamMode, teamName, PLAYER_SKINS as SKIN_ORDER, MODE_NAMES, GUN_GAME_LADDER, redBlue, CTF,
  SOUL, CHAMBER, CUSTOM, ATTACHMENTS, defaultCustom, gunName } from '/shared/config.js';
import { gunArt } from './render/gunArt.js';
import { S, myLevel } from './state.js';
import { send, switchRoom } from './net.js';
import { initAudio, cackle } from './audio.js';
import { toast } from './ui.js';
import { PLAYER_SKIN_NAMES, PLAYER_SPRITES, spriteFor, wearsHats } from './render/sprites.js';
import { savedSkin, saveSkin } from './profile.js';
import { LEVELS, LEVEL_NAMES, levelsFor, MAP_UNLOCKS, mapUnlocked } from '/shared/levels.js';
import { muted, toggleMute, voiceOn } from './voice.js';
import { canFriend } from './friends.js';
import { levelFor, unlockLevel, skinUnlocked, TITLES, KILL_EFFECTS, HATS, hatNeeds, CAMOS, CAMO_CHOICES, goldGuns, camoUnlocked, nextCamo, camoOf, FAMILIARS, petNeeds } from '/shared/progression.js';
import { savedTitle, savedEffect, saveLook, savedHat, saveHat, savedCamo, saveCamo, savedPet, savePet } from './profile.js';
import { sendHello, hatUnlocked, petUnlocked } from './account.js';
import { PET_SPRITES } from './render/pets.js';

const $ = id => document.getElementById(id);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SKINS = SKIN_ORDER.filter(s => PLAYER_SKIN_NAMES[s] && PLAYER_SPRITES[s]);
const skinCanvas = {};
let skinGridBuilt = false;

function renderSkinPreview(canvas, skin) {
  const cached = skinCanvas[skin];
  if (cached) {
    canvas.width = cached.width; canvas.height = cached.height;
    canvas.getContext('2d').drawImage(cached, 0, 0);
    return;
  }
  const sprite = spriteFor(skin), ctx = canvas.getContext('2d'); // a skin, or "skin@hat"
  const W = 40, H = 60; // 2x the 20 x 30 art
  canvas.width = W; canvas.height = H;
  const img = ctx.createImageData(W, H), data = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const color = sprite.pal[sprite.px((x + 0.5) / W, (y + 0.5) / H, false)];
    if (!color) continue;
    const i = (y * W + x) * 4;
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const copy = document.createElement('canvas');
  copy.width = W; copy.height = H;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  skinCanvas[skin] = copy;
}

const skinCards = () => [...document.querySelectorAll('#skins button')];

function updateSkinUI() {
  const skin = savedSkin(), name = PLAYER_SKIN_NAMES[skin] || skin;
  $('skinStatus').textContent = 'Playing as ' + name;
  const level = myLevel();
  skinCards().forEach(b => {
    const locked = !skinUnlocked(b.dataset.skin, level);
    b.classList.toggle('sel', b.dataset.skin === skin);
    b.classList.toggle('locked', locked);
    b.disabled = !!(S.room && S.room.gameOn);
  });
  $('loSkin').textContent = name;
}

function pickSkin(skin) {
  if (S.room && S.room.gameOn || !skinUnlocked(skin, myLevel())) return;
  if (savedSkin() !== skin) {
    saveSkin(skin);
    send({ type: 'skin', skin });
  }
  updateSkinUI();
}

function initSkinGrid() {
  if (skinGridBuilt) return;
  skinGridBuilt = true;
  $('skins').replaceChildren(...SKINS.map(skin => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.skin = skin;
    const canvas = document.createElement('canvas');
    renderSkinPreview(canvas, skin);
    const art = document.createElement('div');
    art.className = 'skin-art';
    art.append(canvas);
    const title = document.createElement('span');
    title.className = 'skin-name';
    title.textContent = PLAYER_SKIN_NAMES[skin] || skin;
    b.append(art, title);
    if (unlockLevel(skin) > 1) {
      const lock = document.createElement('span');
      lock.className = 'skin-lock';
      lock.textContent = 'Level ' + unlockLevel(skin);
      b.append(lock);
    }
    b.addEventListener('click', () => {
      if (!skinUnlocked(skin, myLevel())) return toast(`${PLAYER_SKIN_NAMES[skin] || skin} unlocks at level ${unlockLevel(skin)}`);
      setDraft(skin);
    });
    return b;
  }));
  updateSkinUI();
}

// --- hats: witches only; previews show them on your character (or the Swamp Witch) ---
let hatGridFor = null;
const hatWearer = () => wearsHats(savedSkin()) ? savedSkin() : 'witch';
function buildHatGrid() {
  hatGridFor = hatWearer();
  $('hats').replaceChildren(...Object.keys(HATS).map(hat => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.hat = hat;
    const canvas = document.createElement('canvas');
    renderSkinPreview(canvas, hat === 'none' ? hatGridFor : hatGridFor + '@' + hat);
    const art = document.createElement('div');
    art.className = 'skin-art';
    art.append(canvas);
    const title = document.createElement('span');
    title.className = 'skin-name';
    title.textContent = HATS[hat].name;
    const lock = document.createElement('span');
    lock.className = 'skin-lock';
    b.append(art, title, lock);
    b.addEventListener('click', () => {
      if (!hatUnlocked(hat)) return toast(`${HATS[hat].name}: ${hatNeeds(hat)}`);
      setDraft(hat);
    });
    return b;
  }));
}
function updateHatUI() {
  if (hatGridFor !== hatWearer()) buildHatGrid();
  document.querySelectorAll('#hats button').forEach(b => {
    const hat = b.dataset.hat, h = HATS[hat], locked = !hatUnlocked(hat), lock = b.querySelector('.skin-lock');
    b.classList.toggle('locked', locked);
    if (!(pickerSec === 'hat' && draft)) b.classList.toggle('sel', hat === savedHat());
    const f = h.feat && S.feats?.find(x => x.id === h.feat);
    lock.hidden = !locked;
    lock.textContent = h.feat ? (f ? f.n + ' / ' + f.goal : 'Feat') : 'Level ' + h.level;
    b.title = locked ? hatNeeds(hat) : '';
  });
  $('hatNote').textContent = wearsHats(savedSkin()) ? 'Feat hats: see History & records' : 'Only witches wear hats — pick a witch to show yours';
  $('loHat').textContent = HATS[savedHat()]?.name || HATS.none.name;
}

// --- familiars: cards like the characters' ---
let petGridBuilt = false;
function petCanvas(pet) {
  const c = document.createElement('canvas'), art = PET_SPRITES[pet], n = 36;
  c.width = c.height = n;
  if (!art) return c;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const col = art.pal[art.frames[0]((x + 0.5) / n, (y + 0.5) / n)];
    if (col) img.data.set([col[0], col[1], col[2], 255], (y * n + x) * 4);
  }
  g.putImageData(img, 0, 0);
  return c;
}
function updatePetUI() {
  if (!petGridBuilt) {
    petGridBuilt = true;
    $('pets').replaceChildren(...Object.keys(FAMILIARS).map(pet => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.pet = pet;
      const art = document.createElement('div'), title = document.createElement('span'), lock = document.createElement('span');
      art.className = 'skin-art'; art.append(petCanvas(pet));
      title.className = 'skin-name'; title.textContent = FAMILIARS[pet].name;
      lock.className = 'skin-lock';
      b.append(art, title, lock);
      b.addEventListener('click', () => petUnlocked(pet) ? setDraft(pet) : toast(`${FAMILIARS[pet].name}: ${petNeeds(pet)}`));
      return b;
    }));
  }
  document.querySelectorAll('#pets button').forEach(b => {
    const pet = b.dataset.pet, f = FAMILIARS[pet], locked = !petUnlocked(pet), lock = b.querySelector('.skin-lock');
    b.classList.toggle('locked', locked);
    if (!(pickerSec === 'pet' && draft)) b.classList.toggle('sel', pet === savedPet());
    const feat = f.feat && S.feats?.find(x => x.id === f.feat);
    lock.textContent = f.feat ? (feat ? feat.n + ' / ' + feat.goal : 'Feat') : 'Level ' + f.level;
    b.title = locked ? petNeeds(pet) : '';
  });
  $('loPet').textContent = FAMILIARS[savedPet()]?.name || FAMILIARS.none.name;
}

// --- camos: cards show your favorite gun in each finish; the list shows every gun's progress ---
const CAMO_NAMES = { best: 'Best earned', none: 'Plain steel', ...Object.fromEntries(Object.entries(CAMOS).map(([k, c]) => [k, c.name])) };
const favGun = () => Object.entries(S.weaponKills || {}).filter(([w]) => gunArt(w)).sort((a, b) => b[1] - a[1])[0]?.[0] || 'rifle';
const camoGunsWith = c => Object.entries(S.weaponKills || {}).filter(([w, n]) => gunArt(w) && camoUnlocked(c, n, goldGuns(S.weaponKills))).length;
const camoOpen = c => c === 'best' || c === 'none' || !!S.admin || camoGunsWith(c) > 0;
let camoGridKey = '';
function updateCamoUI() {
  const gun = favGun(), key = gun + '|' + JSON.stringify(S.weaponKills || {});
  if (key !== camoGridKey) {
    camoGridKey = key;
    $('camos').replaceChildren(...CAMO_CHOICES.map(c => {
      const b = document.createElement('button'), name = document.createElement('b'), note = document.createElement('small');
      b.type = 'button'; b.dataset.camo = c;
      const art = gunArt(gun, false, c === 'best' ? camoOf('best', gun, S.weaponKills) : c === 'none' ? null : c);
      if (art) { const img = document.createElement('canvas'); img.className = 'camoArt'; img.width = art.canvas.width; img.height = art.canvas.height; img.getContext('2d').drawImage(art.canvas, 0, 0); b.append(img); }
      name.textContent = CAMO_NAMES[c];
      const n = CAMOS[c] ? camoGunsWith(c) : 0;
      note.textContent = c === 'best' ? "Each gun's top finish" : c === 'none' ? 'No camo' : c === 'obsidian' ? `Every gun, once 10 are gold (${goldGuns(S.weaponKills)}/10)`
        : n ? `On ${n} gun${n === 1 ? '' : 's'}` : `${CAMOS[c].kills} kills with a gun`;
      b.append(name, note);
      if (!camoOpen(c)) { const lock = document.createElement('span'); lock.className = 'card-lock'; lock.textContent = 'Locked'; b.append(lock); }
      b.addEventListener('click', () => camoOpen(c) ? setDraft(c) : toast(`${CAMO_NAMES[c]}: ${note.textContent}`));
      return b;
    }));
    const guns = Object.entries(S.weaponKills || {}).filter(([w]) => gunArt(w)).sort((a, b) => b[1] - a[1]);
    $('camoGuns').replaceChildren(...(guns.length ? guns.map(([w, n]) => {
      const li = document.createElement('li'), next = nextCamo(n), has = camoOf('best', w, S.weaponKills);
      li.innerHTML = '<span class="chalText"></span><b></b><span class="chalBar"><i></i></span><small></small>';
      li.children[0].textContent = gunName(w) + (has ? ' · ' + CAMOS[has].name : '');
      li.children[1].textContent = next ? CAMOS[next.camo].name + ' next' : '✓ all';
      li.children[2].firstChild.style.width = (next ? Math.round(100 * n / next.need) : 100) + '%';
      li.children[3].textContent = next ? `${n} / ${next.need} kills` : `${n} kills`;
      return li;
    }) : [Object.assign(document.createElement('li'), { textContent: 'Get kills with a gun to start earning its camos.' })]));
  }
  document.querySelectorAll('#camos button').forEach(b => {
    b.classList.toggle('locked', !camoOpen(b.dataset.camo));
    if (!(pickerSec === 'camo' && draft)) b.classList.toggle('sel', b.dataset.camo === savedCamo());
  });
  $('loCamo').textContent = CAMO_NAMES[savedCamo()] || CAMO_NAMES.best;
}

// --- attachments (one per player, picked in the lobby; the server checks your level) ---
let savedAtt = 'none';
try { savedAtt = localStorage.getItem('att') || 'none'; } catch {}
if (!ATTACHMENTS[savedAtt]) savedAtt = 'none';
export const sendSavedAtt = () => { if (savedAtt !== 'none') send({ type: 'att', att: savedAtt }); };
function pickAtt(att) {
  if (!ATTACHMENTS[att] || myLevel() < ATTACHMENTS[att].level) return toast(`${ATTACHMENTS[att]?.name} unlocks at level ${ATTACHMENTS[att]?.level}`);
  savedAtt = att;
  try { localStorage.setItem('att', att); } catch {}
  send({ type: 'att', att });
}
function buildAttGrid() {
  $('atts').replaceChildren(...Object.entries(ATTACHMENTS).map(([k, a]) => {
    const b = document.createElement('button'), name = document.createElement('b'), text = document.createElement('small');
    b.type = 'button'; b.dataset.att = k;
    name.textContent = a.name; text.textContent = a.text;
    b.append(name, text);
    if (a.level > 1) { const lock = document.createElement('span'); lock.className = 'card-lock'; lock.textContent = 'Level ' + a.level; b.append(lock); }
    b.addEventListener('click', () => {
      if (myLevel() < a.level) return toast(`${a.name} unlocks at level ${a.level}`);
      setDraft(k);
    });
    return b;
  }));
}
function updateAttUI() {
  const level = myLevel();
  document.querySelectorAll('#atts button').forEach(b => {
    b.classList.toggle('locked', level < ATTACHMENTS[b.dataset.att].level);
    if (!(pickerSec === 'att' && draft)) b.classList.toggle('sel', b.dataset.att === savedAtt);
  });
  const a = ATTACHMENTS[(pickerSec === 'att' && draft) || savedAtt];
  $('attHelp').textContent = a ? `${a.name}: ${a.text}.` : '';
  $('loAtt').textContent = ATTACHMENTS[savedAtt].name;
}

// --- title and kill effect (the Customize card): cards like the attachment picker ---
const LOOKS = { title: [TITLES, () => savedTitle(), '#titles'], effect: [KILL_EFFECTS, () => savedEffect(), '#effects'] };
function buildLookGrids() {
  for (const [sec, [table, , sel]] of Object.entries(LOOKS)) document.querySelector(sel).replaceChildren(...Object.entries(table).map(([k, t]) => {
    const b = document.createElement('button'), name = document.createElement('b');
    b.type = 'button'; b.dataset[sec] = k;
    name.textContent = t.name;
    if (sec === 'effect') { // a jewel in the effect's color
      const gem = document.createElement('i');
      gem.className = 'swatch';
      gem.style.setProperty('--c', t.color ? `rgb(${t.color.join(',')})` : '#b8162f');
      b.append(gem);
    }
    b.append(name);
    if (t.level > 1) { const lock = document.createElement('span'); lock.className = 'card-lock'; lock.textContent = 'Level ' + t.level; b.append(lock); }
    b.addEventListener('click', () => {
      if (myLevel() < t.level) return toast(`${t.name} unlocks at level ${t.level}`);
      setDraft(k);
    });
    return b;
  }));
}
function updateLookUI() {
  const level = myLevel();
  for (const [sec, [table, saved, sel]] of Object.entries(LOOKS)) document.querySelectorAll(sel + ' button').forEach(b => {
    b.classList.toggle('locked', level < table[b.dataset[sec]].level);
    if (!(pickerSec === sec && draft)) b.classList.toggle('sel', b.dataset[sec] === saved());
  });
  $('loTitle').textContent = TITLES[savedTitle()]?.name || 'Apprentice';
  const fx = KILL_EFFECTS[savedEffect()] || KILL_EFFECTS.blood;
  $('loEffect').textContent = fx.name;
}

// --- custom game settings: everyone in the lobby can change them for the next match ---
const CUSTOM_LABELS = {
  gravity: ['Gravity', v => v === 1 ? 'Normal' : v < 1 ? 'Low' : 'High'],
  speed: ['Move speed', v => v === 1 ? 'Normal' : Math.round(v * 100) + '%'],
  hp: ['Health', v => v + ' HP'],
  respawn: ['Respawn time', v => v + 's'],
  weapons: ['Weapons', v => ({ all: 'All', pistols: 'Pistols', shotguns: 'Shotguns', snipers: 'Snipers', blades: 'Blades' })[v]],
  headshots: ['Headshots only', v => v ? 'On' : 'Off'],
  ammo: ['Ammo', v => v === 'infinite' ? 'Infinite' : 'Normal'],
  powerups: ['Power-ups', v => v ? 'On' : 'Off'],
  events: ['Map events', v => v ? 'On' : 'Off'],
};
function buildCustomRows() {
  const note = document.createElement('p');
  note.className = 'note'; note.id = 'customNote';
  const score = $('scoreSetup'); // kills (or souls) to win: the first custom row
  score.className = 'customRow';
  score.querySelectorAll('.seg').forEach(seg => seg.style.setProperty('--n', seg.children.length));
  $('customRows').replaceChildren(note, score, ...Object.entries(CUSTOM).map(([key, values]) => {
    const row = document.createElement('div'), label = document.createElement('span'), seg = document.createElement('div');
    row.className = 'customRow';
    label.className = 'label'; label.textContent = CUSTOM_LABELS[key][0];
    seg.className = 'choice seg'; seg.dataset.key = key;
    seg.style.setProperty('--n', values.length);
    seg.append(...values.map((v, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.i = i;
      b.textContent = CUSTOM_LABELS[key][1](v);
      b.addEventListener('click', () => send({ type: 'custom', key, value: values[i] }));
      return b;
    }));
    row.append(label, seg);
    return row;
  }));
  $('customToggle').addEventListener('click', () => {
    const open = $('customRows').hidden;
    $('customRows').hidden = !open;
    $('customToggle').setAttribute('aria-expanded', String(open));
  });
}
function updateCustomUI(r) {
  const c = r.custom || defaultCustom(), def = defaultCustom(), survival = r.mode === 'survival';
  document.querySelectorAll('#customRows .seg[data-key]').forEach(seg => {
    const at = CUSTOM[seg.dataset.key].indexOf(c[seg.dataset.key]);
    seg.querySelectorAll('button').forEach(b => { b.classList.toggle('sel', +b.dataset.i === at); b.disabled = r.gameOn || survival; });
  });
  const changed = Object.keys(CUSTOM).filter(k => c[k] !== def[k]).map(k => CUSTOM_LABELS[k][0] + ': ' + CUSTOM_LABELS[k][1](c[k]));
  const goal = r.mode === 'harvest' ? `First to ${r.soulWinScore} souls` : r.mode === 'teams' ? `First team to ${r.teamWinScore}`
    : ['ffa', 'snipers', 'build', 'sky'].includes(r.mode) ? `First to ${r.winScore} kills` : '';
  $('customSummary').textContent = survival ? 'not used in Wave Survival' : [goal, ...changed].filter(Boolean).join(' · ') || 'standard rules';
  $('customToggle').classList.toggle('changed', !survival && changed.length > 0);
  $('customNote').textContent = survival ? 'Wave Survival plays by its own rules.' : 'Anyone in the lobby can change these. They apply from the next match.';
}

function updateMapVoteLabel(level) {
  const el = $('mapVote');
  if (!el) return;
  el.textContent = level ? 'Your vote: ' + (LEVEL_NAMES[level] || level) : 'Click a map to vote';
}

function updateModeVoteLabel(mode) {
  const el = $('modeVote');
  if (!el) return;
  el.textContent = mode ? 'Your vote: ' + (MODE_NAMES[mode] || mode) : 'Click a mode to vote';
}

function setLocalModeVote(mode) {
  document.querySelectorAll('#modes button').forEach(b => {
    const mine = b.dataset.mode === mode;
    b.classList.toggle('sel', mine);
    b.classList.toggle('voted', mine);
  });
  updateModeVoteLabel(mode);
}

// --- map grid: a card per realm; clicking one votes for it ---
const cards = () => [...document.querySelectorAll('#levels button')];
// a locked realm is open to everyone here if anyone in the lobby has unlocked it
const mapOpenHere = level => !MAP_UNLOCKS[level] || mapUnlocked(level, myLevel())
  || !!S.room?.players.some(p => !p.bot && p.lvl && mapUnlocked(level, p.lvl));
function updateMapLocks() {
  cards().forEach(b => {
    const need = MAP_UNLOCKS[b.dataset.level];
    if (!need) return;
    let lock = b.querySelector('.card-lock');
    if (!lock) { lock = document.createElement('span'); lock.className = 'card-lock'; b.append(lock); }
    const open = mapOpenHere(b.dataset.level), mine = mapUnlocked(b.dataset.level, myLevel());
    b.classList.toggle('locked', !open);
    lock.hidden = mine;
    lock.textContent = open ? 'Unlocked by the lobby' : 'Level ' + need;
  });
}
function setLocalMapVote(level) {
  cards().forEach(b => {
    const mine = b.dataset.level === level;
    b.classList.toggle('sel', mine);
    b.classList.toggle('voted', mine);
  });
  updateMapVoteLabel(level);
}

// the lobby summary: the mode, realm and character you picked (or what the room is on)
export function updateLoadout() {
  const r = S.room, me = r && r.players.find(p => p.id === S.myId);
  const pickedMode = me?.modeVote || sentMode;
  const mode = pickedMode || r?.mode || 'ffa';
  $('loMode').textContent = MODE_NAMES[mode] || mode;
  const leading = S.level || r?.level;
  const pickedMap = me?.vote || sentMap;
  const level = pickedMap || leading || 'witch';
  // Wave Survival has its own maps: the Realm picker offers only those, the others only the realms
  const maps = levelsFor(mode);
  cards().forEach(b => { b.hidden = !maps.includes(b.dataset.level); });
  updateMapLocks();
  const shown = maps.includes(level) ? level : maps.includes(leading) ? leading : maps[0];
  $('loMap').textContent = LEVEL_NAMES[shown] || shown;
  if (skinGridBuilt) updateSkinUI();
  updateAttUI();
  updateLookUI();
  updateHatUI();
  updateCamoUI();
  updatePetUI();
  showDraft(); // room updates must not wipe what's picked in an open popup
}

// clicking a loadout box opens a popup with just that picker. Picks there are a draft: Done
// sends it, ✕ / Esc / clicking outside keeps what you had
const PICKER_TITLES = { pet: 'CHOOSE FAMILIAR', camo: 'CHOOSE CAMO', hat: 'CHOOSE HAT', mode: 'CHOOSE MODE', map: 'CHOOSE REALM', skin: 'CHOOSE CHARACTER', att: 'CHOOSE ATTACHMENT', title: 'CHOOSE TITLE', effect: 'CHOOSE KILL EFFECT' };
const PICKER_BUTTONS = { mode: ['#modes button', 'mode'], map: ['#levels button', 'level'], skin: ['#skins button', 'skin'], att: ['#atts button', 'att'],
  title: ['#titles button', 'title'], effect: ['#effects button', 'effect'], hat: ['#hats button', 'hat'], camo: ['#camos button', 'camo'], pet: ['#pets button', 'pet'] };
let pickerFrom = null, pickerSec = null, draft = null;
let sentMode = null, sentMap = null; // votes sent but not yet echoed back by the server

// what a mode is about, shown in the Mode popup for whichever mode is highlighted there
export function modeHelpText(mode) {
  const r = S.room;
  const win = r?.winScore ?? WIN_SCORE, teamWin = r?.teamWinScore ?? TEAM_WIN_SCORE;
  return mode === 'plague'
    ? `Infect everyone, or survive ${PLAGUE_DURATION / 60000} minutes. Monsters are fast and claw to infect.`
    : mode === 'hardpoint' ? `Red vs blue. Hold the rotating hill for 1 point per second. Contested hills stop scoring; first to ${HARDPOINT_SCORE_LIMIT} wins or the leader at ${Math.floor(HARDPOINT_MATCH_MS / 60000)}:${String(Math.floor(HARDPOINT_MATCH_MS / 1000) % 60).padStart(2, '0')}.`
    : mode === 'ctf' ? `Red vs blue. Steal the other coven's cauldron and bring it to your base while yours is home. First to ${CTF.caps} captures, or the leader after ${CTF.ms / 60000} minutes. Carriers drop it when they fall.`
    : mode === 'teams' ? `Red vs blue. First team to ${teamWin} kills wins.`
    : mode === 'snipers' ? `Sniper, marksman and beam rifles only. First to ${win} kills wins.`
    : mode === 'build' ? `Every player for themselves, with Earth Ramps: press build mode, click to raise one, stack them for height. First to ${win} kills wins.`
    : mode === 'gungame' ? `Every kill hands you the next gun, ${GUN_GAME_LADDER.length} in all. A kill with the final blade wins; getting stabbed knocks you back one.`
    : mode === 'royale' ? 'One life each. Loot guns from crates and the fallen while the storm closes in. Last one standing wins.'
    : mode === 'harvest' ? `Red vs blue. Every kill drops a soul: reap enemy souls to score, grab your own team's to deny them. First to ${r?.soulWinScore ?? SOUL.win} souls wins.`
    : mode === 'chamber' ? `A pistol with one round, a blade and ${CHAMBER.lives} lives. Every hit kills; every kill loads another round. Last one with lives left wins.`
    : mode === 'sky' ? `Everyone flies a broomstick. Look where you want to go and press forward; jump climbs, crouch dives. Swoop low to grab guns. First to ${win} kills wins.`
    : mode === 'survival' ? 'You and your friends (and ally bots) against endless waves of monsters, in the Crypt or aboard the Drowned Fleet. Earn gold, open doors (or gangplank gates) to new sections, buy guns off the walls and roll the mystery cauldron. Play solo or together.'
    : `Every player for themselves. First to ${win} kills wins.`;
}
function updateModeHelp() {
  const r = S.room, me = r && r.players.find(p => p.id === S.myId);
  const mode = (pickerSec === 'mode' && draft) || me?.modeVote || r?.mode || 'ffa';
  $('modeHelp').textContent = modeHelpText(mode);
}

function showDraft() {
  if (!draft) return;
  const [sel, key] = PICKER_BUTTONS[pickerSec];
  document.querySelectorAll(sel).forEach(b => {
    b.classList.toggle('sel', b.dataset[key] === draft);
    b.classList.toggle('voted', b.dataset[key] === draft);
  });
}
function setDraft(value) {
  initAudio();
  draft = value;
  showDraft();
  updateModeHelp();
  if (pickerSec === 'att') updateAttUI();
}
function commitDraft() {
  if (draft) {
    if (pickerSec === 'mode') { sentMode = draft; setLocalModeVote(draft); send({ type: 'mode', mode: draft }); }
    else if (pickerSec === 'map') { sentMap = draft; setLocalMapVote(draft); send({ type: 'vote', level: draft }); }
    else if (pickerSec === 'att') pickAtt(draft);
    else if (pickerSec === 'hat') { saveHat(draft); sendHello(); }
    else if (pickerSec === 'camo') { saveCamo(draft); sendHello(); }
    else if (pickerSec === 'pet') { savePet(draft); sendHello(); }
    else if (pickerSec === 'title' || pickerSec === 'effect') {
      saveLook(pickerSec === 'title' ? draft : savedTitle(), pickerSec === 'effect' ? draft : savedEffect());
      sendHello(); // the server takes your look with your name
    }
    else pickSkin(draft);
    draft = null;
  }
  closePicker();
  updateLoadout();
}

function openPicker(sec) {
  if (sec === 'map' && document.querySelector('[data-edit=map]').disabled) return;
  initAudio();
  pickerSec = sec; draft = null;
  pickerFrom = document.querySelector(`[data-edit=${sec}]`);
  $('pickerTitle').textContent = PICKER_TITLES[sec];
  document.querySelectorAll('#picker [data-sec]').forEach(f => { f.hidden = f.dataset.sec !== sec; });
  $('picker').hidden = false;
  $('pickerClose').focus();
}
function closePicker() {
  if ($('picker').hidden) return;
  $('picker').hidden = true;
  if (draft) { draft = null; showRoom(); } // cancelled: put the highlights back on what you had
  pickerFrom?.focus();
}

// after I'm Ready: a loading screen until the match starts, so waiting doesn't look like a glitch
let loadingOn = false;
function showLoading(on, status) {
  loadingOn = on;
  $('loading').hidden = !on;
  if (status !== undefined) $('loadingStatus').textContent = status;
  else if (on && !$('loadingStatus').textContent) $('loadingStatus').textContent = 'Brewing the realm…';
}
export const hideLoading = () => showLoading(false);

export const inviteLink = code => location.origin + location.pathname + '?room=' + code;
export const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const goToRoom = code => switchRoom(code ? '?room=' + code : '');

export function initRoom() {
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openPicker(b.dataset.edit)));
  $('pickerClose').addEventListener('click', closePicker);
  $('pickerDone').addEventListener('click', commitDraft);
  $('picker').addEventListener('click', e => { if (e.target === $('picker')) closePicker(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || $('picker').hidden) return;
    e.stopImmediatePropagation();
    closePicker();
  }, true);
  $('readyBtn').addEventListener('click', () => { initAudio(); cackle(); send({ type: 'ready' }); showLoading(true); });
  $('loadingCancel').addEventListener('click', () => { send({ type: 'unready' }); showLoading(false); });
  document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => mapOpenHere(b.dataset.level) ? setDraft(b.dataset.level)
    : toast(`${LEVEL_NAMES[b.dataset.level]} unlocks at level ${MAP_UNLOCKS[b.dataset.level]} — or play it with someone who has it`)));
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setDraft(b.dataset.mode)));
  buildAttGrid();
  buildLookGrids();
  buildCustomRows();
  document.querySelectorAll('#scorePick button, #teamScorePick button, #soulScorePick button').forEach(b => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('button').forEach(o => o.classList.toggle('sel', o === b));
    send({ type: 'score', score: +b.dataset.score });
  }));
  document.querySelectorAll('#plagueSelection button').forEach(b => b.addEventListener('click', () => send({ type: 'plagueSetup', selection: b.dataset.selection })));
  document.querySelectorAll('#teamPick button').forEach(b => b.addEventListener('click', () => send({ type: 'team', team: +b.dataset.team })));
  // bot difficulty for the next + BOT, remembered in this browser
  let botLevel = 'medium';
  try { botLevel = localStorage.getItem('botLevel') || 'medium'; } catch {}
  const showBotLevel = () => document.querySelectorAll('#botLevel button').forEach(b => b.classList.toggle('sel', b.dataset.level === botLevel));
  document.querySelectorAll('#botLevel button').forEach(b => b.addEventListener('click', () => {
    botLevel = b.dataset.level; showBotLevel();
    try { localStorage.setItem('botLevel', botLevel); } catch {}
  }));
  showBotLevel();
  $('addBot').addEventListener('click', () => send({ type: 'addBot', level: botLevel, count: 1 }));
  $('addBots3').addEventListener('click', () => send({ type: 'addBot', level: botLevel, count: 3 }));
  $('fillBots').addEventListener('click', () => send({ type: 'fillBots', level: botLevel }));
  $('removeBot').addEventListener('click', () => send({ type: 'removeBot', count: 1 }));
  $('removeBots3').addEventListener('click', () => send({ type: 'removeBot', count: 3 }));
  $('clearBots').addEventListener('click', () => send({ type: 'clearBots' }));
  // kick a specific bot from the roster (event delegation — rows are rebuilt often)
  $('roster').addEventListener('click', e => {
    const add = e.target.closest('[data-friend]');
    if (add) { send({ type: 'friendAdd', player: +add.dataset.friend }); add.disabled = true; return; }
    const btn = e.target.closest('[data-kick-bot]');
    if (!btn || S.room?.gameOn) return;
    send({ type: 'removeBot', id: +btn.dataset.kickBot });
  });

  $('copyLink').addEventListener('click', async () => {
    if (!S.room) return;
    const link = inviteLink(S.room.code);
    try { await navigator.clipboard.writeText(link); toast('Invite link copied'); }
    catch { toast(link); } // clipboard blocked (plain http on another device): show it to copy by hand
  });
  $('quickPlay').addEventListener('click', () => switchRoom('?play=1'));
  $('tutorialLink').addEventListener('click', () => switchRoom('?room=' + newCode() + '&tutorial=1'));
  $('newRoom').addEventListener('click', () => goToRoom(newCode()));
  // leave the match for a lobby of your own (quick play could drop you right back into it)
  for (const id of ['leaveGame', 'gameLeave']) $(id).addEventListener('click', () => goToRoom(newCode()));
}

let lobbyWarmed = false;
export function warmLobby() {
  if (lobbyWarmed) return;
  lobbyWarmed = true;
  initSkinGrid();
}

export function showRoom() {
  warmLobby();
  const r = S.room;
  if (!r) return;
  $('roomCode').textContent = r.code;
  $('roomKind').textContent = r.private ? 'private' : 'public';
  const me = r.players.find(p => p.id === S.myId);
  const modeVotes = r.modeVotes || {};
  const myModeVote = me && me.modeVote;
  document.querySelectorAll('#modes button').forEach(b => {
    const n = modeVotes[b.dataset.mode] || 0;
    const mine = myModeVote === b.dataset.mode;
    b.classList.toggle('sel', mine);
    b.classList.toggle('voted', mine);
    b.classList.toggle('leading', b.dataset.mode === r.mode);
    let badge = b.querySelector('.votes');
    if (!badge) { badge = document.createElement('span'); badge.className = 'votes'; b.appendChild(badge); }
    badge.textContent = mine ? (n > 1 ? 'YOU · ' + n : 'YOU') : (n ? String(n) : '');
  });
  updateModeVoteLabel(myModeVote);
  document.body.classList.toggle('plague', r.mode === 'plague');
  const win = r.winScore ?? WIN_SCORE, teamWin = r.teamWinScore ?? TEAM_WIN_SCORE;
  updateModeHelp();
  document.body.classList.toggle('snipers', r.mode === 'snipers');
  const scoreOn = r.mode === 'ffa' || r.mode === 'snipers' || r.mode === 'teams' || r.mode === 'build' || r.mode === 'harvest' || r.mode === 'sky';
  $('scoreSetup').hidden = !scoreOn;
  $('scoreSetup').querySelector('.label').textContent = r.mode === 'harvest' ? 'SOULS TO WIN' : 'KILLS TO WIN';
  $('scorePick').hidden = r.mode === 'teams' || r.mode === 'harvest';
  $('teamScorePick').hidden = r.mode !== 'teams';
  $('soulScorePick').hidden = r.mode !== 'harvest';
  document.querySelectorAll('#soulScorePick button').forEach(b => {
    b.classList.toggle('sel', +b.dataset.score === (r.soulWinScore ?? SOUL.win));
    b.disabled = r.gameOn;
  });
  updateCustomUI(r);
  document.querySelectorAll('#scorePick button').forEach(b => {
    b.classList.toggle('sel', +b.dataset.score === win);
    b.disabled = r.gameOn;
  });
  document.querySelectorAll('#teamScorePick button').forEach(b => {
    b.classList.toggle('sel', +b.dataset.score === teamWin);
    b.disabled = r.gameOn;
  });
  const manual = r.mode === 'plague' && r.plagueSelection === 'manual';
  $('plagueSetup').hidden = r.mode !== 'plague';
  document.querySelectorAll('#plagueSelection button').forEach(b => {
    const selected = b.dataset.selection === r.plagueSelection;
    b.classList.toggle('sel', selected);
    b.setAttribute('aria-pressed', String(selected));
    b.disabled = r.gameOn;
  });
  $('plagueSetupHelp').textContent = manual
    ? 'Set each player or bot to Infected or Healthy in the player list above. Choose at least one of each. Role changes reset ready status.'
    : 'Exactly one player or bot is picked at random when each round starts.';

  const teams = redBlue(r.mode);
  // server is source of truth — revert a local pick the server rejected (e.g. unknown skin)
  if (me && me.skin && PLAYER_SKIN_NAMES[me.skin] && me.skin !== savedSkin()) {
    saveSkin(me.skin);
  }
  $('roster').replaceChildren(...[...r.players].sort((a, b) => r.mode === 'plague' && !r.gameOn ? a.id - b.id : a.team - b.team).map(p => {
    const li = document.createElement('li');
    li.dataset.id = p.id; // voice.js lights up whoever is talking
    if (isTeamMode(r.mode) && (teams || r.gameOn)) li.classList.add('team' + p.team);
    if (manual && !r.gameOn) li.classList.add('team' + p.plagueStartTeam, 'plague-role-row');
    li.classList.toggle('ready', p.ready);
    li.classList.toggle('you', p.id === S.myId);
    li.classList.toggle('bot', !!p.bot);
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === S.myId ? ' (you)' : '');
    if (p.title) { const t = document.createElement('small'); t.className = 'rtitle'; t.textContent = p.title; name.append(t); }
    const tag = document.createElement('span');
    tag.className = 'tag';
    const side = teams || (r.mode === 'plague' && r.gameOn) ? teamName(r.mode, p.team) + ' · ' : '';
    const skin = r.mode === 'plague' && r.gameOn && p.team === PLAGUE_TEAM ? 'Monster' : PLAYER_SKIN_NAMES[p.skin] || 'Witch';
    tag.textContent = side + skin + (p.bot ? '' : ' · ' + (p.ready ? 'READY' : 'NOT READY'));
    li.append(name, tag);
    if (p.account && p.id !== S.myId && canFriend(p.name)) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'add-friend';
      add.dataset.friend = p.id;
      add.textContent = '+ Friend';
      add.title = 'Add ' + p.name + ' as a friend';
      li.append(add);
    }
    if (p.bot && !r.gameOn) {
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'bot-kick';
      kick.dataset.kickBot = p.id;
      kick.title = 'Remove ' + p.name;
      kick.setAttribute('aria-label', 'Remove ' + p.name);
      kick.textContent = '×';
      li.append(kick);
    }
    if (manual && !r.gameOn) {
      const role = document.createElement('select');
      role.className = 'plague-role';
      role.dataset.playerId = p.id;
      role.setAttribute('aria-label', 'Starting role for ' + p.name);
      role.append(new Option('Healthy', HEALTHY_TEAM), new Option('Infected', PLAGUE_TEAM));
      role.value = p.plagueStartTeam;
      role.addEventListener('change', () => send({ type: 'plagueRole', id: p.id, team: +role.value }));
      li.append(role);
    }
    if (voiceOn() && !p.bot && p.id !== S.myId) { // mute their voice, this session
      const mute = document.createElement('button');
      mute.className = 'mute';
      mute.title = muted.has(p.id) ? 'Unmute' : 'Mute';
      mute.textContent = muted.has(p.id) ? '🔇' : '🔈';
      mute.addEventListener('click', () => { toggleMute(p.id); showRoom(); });
      name.append(' ', mute);
    }
    return li;
  }));
  $('rosterHead').textContent = `PLAYERS ${r.players.length}/${r.max}`;
  $('teamPick').hidden = !teams || r.gameOn;
  document.querySelectorAll('#teamPick button').forEach(b => b.classList.toggle('sel', +b.dataset.team === S.myTeam));
  $('botCtl').hidden = false;
  const full = r.players.length >= r.max, hasBot = r.players.some(p => p.bot);
  for (const id of ['addBot', 'addBots3', 'fillBots']) $(id).disabled = full || r.gameOn;
  for (const id of ['removeBot', 'removeBots3', 'clearBots']) $(id).disabled = !hasBot || r.gameOn;

  // map vote counts on each card — sel/voted = your pick
  const votes = r.votes || {};
  const myVote = me && me.vote;
  document.querySelectorAll('#levels button').forEach(b => {
    const n = votes[b.dataset.level] || 0;
    const mine = myVote === b.dataset.level;
    b.classList.toggle('sel', mine);
    b.classList.toggle('voted', mine);
    let badge = b.querySelector('.votes');
    if (!badge) { badge = document.createElement('span'); badge.className = 'votes'; b.appendChild(badge); }
    badge.textContent = mine ? (n > 1 ? 'YOUR VOTE · ' + n : 'YOUR VOTE') : (n ? n + ' vote' + (n === 1 ? '' : 's') : '');
  });
  updateMapVoteLabel(myVote);
  if (me && me.vote === sentMap) sentMap = null;
  if (me && me.modeVote === sentMode) sentMode = null;
  updateLoadout();

  // what's needed before the match can start
  const humans = r.players.filter(p => !p.bot);
  const bots = r.players.filter(p => p.bot);
  const humanReady = humans.filter(p => p.ready).length;
  const aloneWithBots = humans.length === 1 && bots.length > 0;
  // the loading screen follows your ready state; it says who we're still waiting on
  if (me && me.ready && !r.gameOn && !S.started) {
    const left = humans.length - humanReady;
    showLoading(true, aloneWithBots || left <= 0 ? 'Brewing the realm…'
      : `Waiting for ${left} of ${humans.length} player${humans.length === 1 ? '' : 's'} to be ready`);
  } else if (loadingOn && (!me || !me.ready)) showLoading(false);
  const btn = $('readyBtn');
  const minPlayers = r.mode === 'survival' ? 1 : 2;
  btn.disabled = !me || me.ready || r.gameOn || S.disconnected || r.plagueSetupValid === false || r.players.length < minPlayers;
  btn.textContent = me && me.ready
    ? (aloneWithBots || humanReady >= humans.length ? 'Starting…' : 'Waiting…')
    : aloneWithBots || (humans.length === 1 && minPlayers === 1) ? "I'm Ready — Start"
    : "I'm Ready";
  if (S.disconnected) return;
  $('waitMsg').textContent =
    r.gameOn ? 'Match in progress — joining...'
    : r.players.length < minPlayers ? 'Waiting for players — send friends the invite link, or add bots'
    : r.mode === 'survival' && !me?.ready ? `Wave Survival ${r.level === 'ship' ? 'aboard the Drowned Fleet' : 'in the Crypt'} — hit I'm Ready to start${bots.length ? ` with ${bots.length} ally bot${bots.length === 1 ? '' : 's'}` : ' (add bots as allies if you like)'}`
    : r.plagueSetupValid === false ? 'Choose at least one infected and one healthy player in the list above.'
    : me && me.ready ? (aloneWithBots
      ? 'Starting match…'
      : `Waiting for players (${humanReady}/${humans.length} ready) · votes decide the map and mode`)
    : aloneWithBots
      ? `Vote map & mode, then hit I'm Ready to start vs ${bots.length} bot${bots.length === 1 ? '' : 's'}`
      : `Vote a map and mode, then click I'm Ready (${humanReady}/${humans.length} ready)`;
}
