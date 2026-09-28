// Lobby room panel: room code + invite link, quick play / new private room, mode, teams,
// who's here and ready, bots, and the ready button.
// Switching rooms reloads the page with a new ?room= code; your profile survives the reload.
import { WIN_SCORE, TEAM_WIN_SCORE, HARDPOINT_SCORE_LIMIT, HARDPOINT_MATCH_MS, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, isTeamMode, teamName, PLAYER_SKINS as SKIN_ORDER, MODE_NAMES, GUN_GAME_LADDER } from '/shared/config.js';
import { S } from './state.js';
import { send, switchRoom } from './net.js';
import { initAudio, cackle } from './audio.js';
import { toast } from './ui.js';
import { PLAYER_SKIN_NAMES, PLAYER_SPRITES } from './render/sprites.js';
import { savedSkin, saveSkin } from './profile.js';
import { LEVELS, LEVEL_NAMES } from '/shared/levels.js';
import { buildTerrain, MAT, noise } from '/shared/terrain.js';
import { THEMES } from './themes.js';
import { muted, toggleMute, voiceOn } from './voice.js';
import { canFriend } from './friends.js';
import { levelFor, unlockLevel, skinUnlocked } from '/shared/progression.js';

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
  const sprite = PLAYER_SPRITES[skin], ctx = canvas.getContext('2d');
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
  const level = levelFor(S.xp);
  skinCards().forEach(b => {
    const locked = !skinUnlocked(b.dataset.skin, level);
    b.classList.toggle('sel', b.dataset.skin === skin);
    b.classList.toggle('locked', locked);
    b.disabled = !!(S.room && S.room.gameOn);
  });
  $('loSkin').textContent = name;
}

function pickSkin(skin) {
  if (S.room && S.room.gameOn || !skinUnlocked(skin, levelFor(S.xp))) return;
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
      if (!skinUnlocked(skin, levelFor(S.xp))) return toast(`${PLAYER_SKIN_NAMES[skin] || skin} unlocks at level ${unlockLevel(skin)}`);
      setDraft(skin);
    });
    return b;
  }));
  updateSkinUI();
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
const mapPreviewCache = {};

// a top-down picture of a map, shaded by height and material (built once per map)
function mapPreview(name) {
  let c = mapPreviewCache[name];
  if (c) return c;
  const T = buildTerrain(LEVELS[name], 2, name), th = THEMES[name];
  c = document.createElement('canvas');
  c.width = T.TW; c.height = T.TH;
  const ctx = c.getContext('2d'), img = ctx.createImageData(T.TW, T.TH), pit = th.minimap[2];
  const floor = { hell: [70, 28, 22], robot: [74, 50, 36], witch: [32, 52, 28], haunt: [90, 78, 48], ice: [150, 180, 210], castle: [72, 76, 80], nuke: [78, 84, 44] }[name] || th.minimap[0];
  for (let k = 0; k < T.TW * T.TH; k++) {
    const kind = T.kind[k], m = T.mat[k], h = T.hgt[k];
    let r, g, bl;
    if (kind === 2) { r = pit[0]; g = pit[1]; bl = pit[2]; }
    else if (m === MAT.LAVA) { r = 255; g = 200; bl = 50; }
    else if (kind === 1) {
      const shade = 0.55 + 0.45 * Math.min(1, h / 2.2), top = th.wallTop || th.wall;
      const base = m === MAT.ROCK ? (name === 'ice' ? [160, 195, 225] : [110, 50, 38]) : m === MAT.LEAVES || m === MAT.ROOTS ? [40, 85, 35] : m === MAT.BARK ? [70, 50, 32] : m === MAT.RACK ? [86, 58, 40] : m === MAT.CRATE ? [120, 95, 50] : m === MAT.PUMPKIN ? [230, 110, 25] : top;
      const mott = 0.85 + 0.2 * noise((k % T.TW) * 0.4, (k / T.TW | 0) * 0.4);
      r = base[0] * shade * mott; g = base[1] * shade * mott; bl = base[2] * shade * mott;
    } else {
      const mott = 0.8 + 0.3 * noise((k % T.TW) * 0.5, (k / T.TW | 0) * 0.5);
      r = floor[0] * mott; g = floor[1] * mott; bl = floor[2] * mott;
    }
    img.data.set([r, g, bl, 255], k * 4);
  }
  ctx.putImageData(img, 0, 0);
  return mapPreviewCache[name] = c;
}

function paintPreview(view, name) {
  const c = mapPreview(name);
  view.width = c.width; view.height = c.height;
  view.getContext('2d').drawImage(c, 0, 0);
}

function drawMapCard(b) {
  if (b.querySelector('canvas.preview')) return;
  const view = document.createElement('canvas');
  view.className = 'preview';
  paintPreview(view, b.dataset.level);
  b.prepend(view);
}

function initMapGrid() {
  // paint previews one frame each so opening the lobby doesn't hitch
  const list = cards();
  let i = 0;
  const pump = () => {
    if (i >= list.length) return;
    drawMapCard(list[i++]);
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
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
  $('loMap').textContent = LEVEL_NAMES[level] || level;
  if (skinGridBuilt) updateSkinUI();
  showDraft(); // room updates must not wipe what's picked in an open popup
}

// clicking a loadout box opens a popup with just that picker. Picks there are a draft: Done
// sends it, ✕ / Esc / clicking outside keeps what you had
const PICKER_TITLES = { mode: 'CHOOSE MODE', map: 'CHOOSE REALM', skin: 'CHOOSE CHARACTER' };
const PICKER_BUTTONS = { mode: ['#modes button', 'mode'], map: ['#levels button', 'level'], skin: ['#skins button', 'skin'] };
let pickerFrom = null, pickerSec = null, draft = null;
let sentMode = null, sentMap = null; // votes sent but not yet echoed back by the server

// what a mode is about, shown in the Mode popup for whichever mode is highlighted there
function modeHelpText(mode) {
  const r = S.room;
  const win = r?.winScore ?? WIN_SCORE, teamWin = r?.teamWinScore ?? TEAM_WIN_SCORE;
  return mode === 'plague'
    ? `Infect everyone, or survive ${PLAGUE_DURATION / 60000} minutes. Monsters are fast and claw to infect.`
    : mode === 'hardpoint' ? `Red vs blue. Hold the rotating hill for 1 point per second. Contested hills stop scoring; first to ${HARDPOINT_SCORE_LIMIT} wins or the leader at ${Math.floor(HARDPOINT_MATCH_MS / 60000)}:${String(Math.floor(HARDPOINT_MATCH_MS / 1000) % 60).padStart(2, '0')}.`
    : mode === 'teams' ? `Red vs blue. First team to ${teamWin} kills wins.`
    : mode === 'snipers' ? `Sniper, crossbow, and beam rifle only. First to ${win} kills wins.`
    : mode === 'build' ? `Every player for themselves, with Earth Ramps: press build mode, click to raise one, stack them for height. First to ${win} kills wins.`
    : mode === 'gungame' ? `Every kill hands you the next gun, ${GUN_GAME_LADDER.length} in all. A kill with the final blade wins; getting stabbed knocks you back one.`
    : mode === 'royale' ? 'One life each. Loot guns from crates and the fallen while the storm closes in. Last one standing wins.'
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
}
function commitDraft() {
  if (draft) {
    if (pickerSec === 'mode') { sentMode = draft; setLocalModeVote(draft); send({ type: 'mode', mode: draft }); }
    else if (pickerSec === 'map') { sentMap = draft; setLocalMapVote(draft); send({ type: 'vote', level: draft }); }
    else pickSkin(draft);
    draft = null;
  }
  closePicker();
  updateLoadout();
}

function openPicker(sec) {
  initAudio();
  pickerSec = sec; draft = null;
  pickerFrom = document.querySelector(`#loadout [data-edit=${sec}]`);
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
  document.querySelectorAll('#loadout [data-edit]').forEach(b => b.addEventListener('click', () => openPicker(b.dataset.edit)));
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
  document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => setDraft(b.dataset.level)));
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setDraft(b.dataset.mode)));
  document.querySelectorAll('#scorePick button, #teamScorePick button').forEach(b => b.addEventListener('click', () => {
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
  $('newRoom').addEventListener('click', () => goToRoom(newCode()));
  // leave the match for a lobby of your own (quick play could drop you right back into it)
  for (const id of ['leaveGame', 'gameLeave']) $(id).addEventListener('click', () => goToRoom(newCode()));
}

let lobbyWarmed = false;
export function warmLobby() {
  if (lobbyWarmed) return;
  lobbyWarmed = true;
  initSkinGrid();
  initMapGrid();
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
  const scoreOn = r.mode === 'ffa' || r.mode === 'snipers' || r.mode === 'teams' || r.mode === 'build';
  $('scoreSetup').hidden = !scoreOn;
  $('scorePick').hidden = r.mode === 'teams';
  $('teamScorePick').hidden = r.mode !== 'teams';
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

  const teams = r.mode === 'teams' || r.mode === 'hardpoint';
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
    const tag = document.createElement('span');
    tag.className = 'tag';
    const side = teams || (r.mode === 'plague' && r.gameOn) ? teamName(r.mode, p.team) + ' · ' : '';
    const skin = r.mode === 'plague' && r.gameOn && p.team === PLAGUE_TEAM ? 'Monster' : PLAYER_SKIN_NAMES[p.skin] || 'Witch';
    const botLvl = p.bot && p.level ? p.level.toUpperCase() + ' · ' + (p.personality ? p.personality.toUpperCase() + ' · ' : '') : '';
    tag.textContent = side + botLvl + skin + (p.bot ? '' : ' · ' + (p.ready ? 'READY' : 'NOT READY'));
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
  btn.disabled = !me || me.ready || r.gameOn || S.disconnected || r.plagueSetupValid === false || r.players.length < 2;
  btn.textContent = me && me.ready
    ? (aloneWithBots || humanReady >= humans.length ? 'Starting…' : 'Waiting…')
    : aloneWithBots ? "I'm Ready — Start"
    : "I'm Ready";
  if (S.disconnected) return;
  $('waitMsg').textContent =
    r.gameOn ? 'Match in progress — joining...'
    : r.players.length < 2 ? 'Waiting for players — send friends the invite link, or add bots'
    : r.plagueSetupValid === false ? 'Choose at least one infected and one healthy player in the list above.'
    : me && me.ready ? (aloneWithBots
      ? 'Starting match…'
      : `Waiting for players (${humanReady}/${humans.length} ready) · votes decide the map and mode`)
    : aloneWithBots
      ? `Vote map & mode, then hit I'm Ready to start vs ${bots.length} bot${bots.length === 1 ? '' : 's'}`
      : `Vote a map and mode, then click I'm Ready (${humanReady}/${humans.length} ready)`;
}
