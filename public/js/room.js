// Lobby room panel: room code + invite link, quick play / new private room, mode, teams,
// who's here and ready, bots, and the ready button.
// Switching rooms reloads the page with a new ?room= code; your profile survives the reload.
import { WIN_SCORE, TEAM_WIN_SCORE, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, isTeamMode, teamName, PLAYER_SKINS as SKIN_ORDER } from '/shared/config.js';
import { S } from './state.js';
import { send } from './net.js';
import { initAudio } from './audio.js';
import { toast } from './ui.js';
import { PLAYER_SKIN_NAMES, PLAYER_SPRITES } from './render/sprites.js';
import { savedSkin, saveSkin } from './profile.js';
import { LEVELS } from '/shared/levels.js';
import { buildTerrain, MAT, noise } from '/shared/terrain.js';
import { THEMES } from './themes.js';
import { muted, toggleMute, voiceOn } from './voice.js';

const $ = id => document.getElementById(id);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SKINS = SKIN_ORDER.filter(s => PLAYER_SKIN_NAMES[s] && PLAYER_SPRITES[s]);
const skinCanvas = {};
let browsedSkin = 'witch';
let skinCarouselBuilt = false;

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

function centeredSkin() {
  const strip = $('skins'), mid = strip.scrollLeft + strip.clientWidth / 2;
  return skinCards().reduce((best, b) => Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - mid) ? b : best);
}

function scrollToSkin(skin, instant = false) {
  const strip = $('skins'), b = skinCards().find(c => c.dataset.skin === skin);
  if (!b) return;
  if (instant) {
    const prev = strip.style.scrollBehavior;
    strip.style.scrollBehavior = 'auto';
    strip.scrollLeft = b.offsetLeft + b.offsetWidth / 2 - strip.clientWidth / 2;
    strip.style.scrollBehavior = prev;
  } else {
    strip.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - strip.clientWidth / 2 });
  }
  skinCards().forEach(c => c.classList.toggle('centered', c === b));
}

function updateSkinButton() {
  const chosen = savedSkin() === browsedSkin;
  const name = (PLAYER_SKIN_NAMES[browsedSkin] || browsedSkin).toUpperCase();
  const btn = $('chooseSkin');
  btn.textContent = chosen ? 'SELECTED · ' + name : 'USE ' + name;
  btn.disabled = chosen || !!(S.room && S.room.gameOn);
  btn.classList.toggle('picked', chosen);
  const status = $('skinStatus');
  if (status) status.textContent = 'Playing as ' + (PLAYER_SKIN_NAMES[savedSkin()] || savedSkin());
  skinCards().forEach(b => b.classList.toggle('sel', b.dataset.skin === savedSkin()));
}

function pickSkin(skin) {
  if (S.room && S.room.gameOn) return;
  browsedSkin = skin;
  if (savedSkin() !== skin) {
    saveSkin(skin);
    send({ type: 'skin', skin });
  }
  updateSkinButton();
  scrollToSkin(skin);
}

function initSkinCarousel() {
  if (skinCarouselBuilt) return;
  skinCarouselBuilt = true;
  const strip = $('skins');
  strip.replaceChildren(...SKINS.map(skin => {
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
    b.addEventListener('click', () => pickSkin(skin));
    return b;
  }));
  const step = dir => {
    const all = skinCards(), idx = all.indexOf(centeredSkin());
    const next = all[(idx + dir + all.length) % all.length];
    browsedSkin = next.dataset.skin;
    scrollToSkin(browsedSkin);
    updateSkinButton();
  };
  $('skinPrev').addEventListener('click', () => step(-1));
  $('skinNext').addEventListener('click', () => step(1));
  strip.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    strip.scrollBy({ left: e.deltaY });
  }, { passive: false });
  let scrollTick = 0;
  const mark = () => {
    scrollTick = 0;
    const c = centeredSkin();
    browsedSkin = c.dataset.skin;
    skinCards().forEach(b => b.classList.toggle('centered', b === c));
    updateSkinButton();
  };
  strip.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(mark);
  }, { passive: true });
  browsedSkin = PLAYER_SKIN_NAMES[savedSkin()] ? savedSkin() : 'witch';
  scrollToSkin(browsedSkin, true);
  updateSkinButton();
}

function updateMapVoteLabel(level) {
  const el = $('mapVote');
  if (!el) return;
  const names = { witch: 'Witch Swamp', castle: 'Gothic Castle', hell: 'Hell', robot: 'Robot Factory', haunt: 'Haunted House', ice: 'Ice Fields', nuke: 'Nuketown' };
  el.textContent = level ? 'Your vote: ' + (names[level] || level) : 'Click a map to vote';
}

// --- map carousel: scroll or swipe through the maps, arrows step one card; clicking a card picks it ---
const cards = () => [...document.querySelectorAll('#levels button')];
const mapPreviewCache = {};

// a top-down picture of each map on its card, shaded by height and material (built once)
function drawMapPreview(b) {
  const name = b.dataset.level;
  if (b.querySelector('canvas.preview')) return;
  let c = mapPreviewCache[name];
  if (!c) {
    const T = buildTerrain(LEVELS[name], 2, name), th = THEMES[name];
    c = document.createElement('canvas');
    c.width = T.TW; c.height = T.TH;
    const ctx = c.getContext('2d'), img = ctx.createImageData(T.TW, T.TH), pit = th.minimap[2];
    const floor = { hell: [70, 28, 22], robot: [48, 54, 62], witch: [32, 52, 28], haunt: [90, 78, 48], ice: [150, 180, 210], castle: [72, 76, 80], nuke: [70, 75, 55] }[name] || th.minimap[0];
    for (let k = 0; k < T.TW * T.TH; k++) {
      const kind = T.kind[k], m = T.mat[k], h = T.hgt[k];
      let r, g, bl;
      if (kind === 2) { r = pit[0]; g = pit[1]; bl = pit[2]; }
      else if (m === MAT.LAVA) { r = 255; g = 200; bl = 50; }
      else if (kind === 1) {
        const shade = 0.55 + 0.45 * Math.min(1, h / 2.2), top = th.wallTop || th.wall;
        const base = m === MAT.ROCK ? (name === 'ice' ? [160, 195, 225] : [110, 50, 38]) : m === MAT.LEAVES || m === MAT.ROOTS ? [40, 85, 35] : m === MAT.BARK ? [70, 50, 32] : m === MAT.RACK ? [50, 55, 65] : m === MAT.CRATE ? [120, 95, 50] : top;
        const mott = 0.85 + 0.2 * noise((k % T.TW) * 0.4, (k / T.TW | 0) * 0.4);
        r = base[0] * shade * mott; g = base[1] * shade * mott; bl = base[2] * shade * mott;
      } else {
        const mott = 0.8 + 0.3 * noise((k % T.TW) * 0.5, (k / T.TW | 0) * 0.5);
        r = floor[0] * mott; g = floor[1] * mott; bl = floor[2] * mott;
      }
      img.data.set([r, g, bl, 255], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    mapPreviewCache[name] = c;
  }
  const view = document.createElement('canvas');
  view.className = 'preview'; view.width = c.width; view.height = c.height;
  view.getContext('2d').drawImage(c, 0, 0);
  b.prepend(view);
}

// which card is in the middle of the strip
function centered() {
  const strip = $('levels'), mid = strip.scrollLeft + strip.clientWidth / 2;
  return cards().reduce((best, b) => Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - mid) ? b : best);
}
export function scrollToMap(name) {
  const strip = $('levels'), b = cards().find(c => c.dataset.level === name);
  if (b) strip.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - strip.clientWidth / 2 });
}

function initMapCarousel() {
  const strip = $('levels');
  // paint previews one frame each so opening the lobby doesn't hitch
  const list = cards();
  let i = 0;
  const pump = () => {
    if (i >= list.length) return;
    drawMapPreview(list[i++]);
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  const step = dir => {
    const all = cards(), idx = all.indexOf(centered());
    scrollToMap(all[(idx + dir + all.length) % all.length].dataset.level);
  };
  $('mapPrev').addEventListener('click', () => step(-1));
  $('mapNext').addEventListener('click', () => step(1));
  strip.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    strip.scrollBy({ left: e.deltaY });
  }, { passive: false });
  let scrollTick = 0;
  const mark = () => {
    scrollTick = 0;
    const c = centered();
    cards().forEach(b => b.classList.toggle('centered', b === c));
  };
  strip.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(mark);
  }, { passive: true });
  requestAnimationFrame(mark);
}

function setLocalMapVote(level) {
  cards().forEach(b => {
    const mine = b.dataset.level === level;
    b.classList.toggle('sel', mine);
    b.classList.toggle('voted', mine);
  });
  updateMapVoteLabel(level);
  scrollToMap(level);
}

export const inviteLink = code => location.origin + location.pathname + '?room=' + code;
export const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const goToRoom = code => { location.href = code ? '?room=' + code : location.pathname; };

export function initRoom() {
  browsedSkin = PLAYER_SKIN_NAMES[savedSkin()] ? savedSkin() : 'witch';
  $('chooseSkin').addEventListener('click', () => pickSkin(browsedSkin));
  $('readyBtn').addEventListener('click', () => { initAudio(); send({ type: 'ready' }); });
  document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => {
    initAudio();
    setLocalMapVote(b.dataset.level);
    send({ type: 'vote', level: b.dataset.level });
  }));
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => send({ type: 'mode', mode: b.dataset.mode })));
  document.querySelectorAll('#scorePick button, #teamScorePick button').forEach(b => b.addEventListener('click', () => send({ type: 'score', score: +b.dataset.score })));
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

  $('copyLink').addEventListener('click', async () => {
    if (!S.room) return;
    const link = inviteLink(S.room.code);
    try { await navigator.clipboard.writeText(link); toast('Invite link copied'); }
    catch { toast(link); } // clipboard blocked (plain http on another device): show it to copy by hand
  });
  $('quickPlay').addEventListener('click', () => { location.href = '?play=1'; });
  $('newRoom').addEventListener('click', () => goToRoom(newCode()));
  // leave the match for a lobby of your own (quick play could drop you right back into it)
  for (const id of ['leaveGame', 'gameLeave']) $(id).addEventListener('click', () => goToRoom(newCode()));
}

let lobbyWarmed = false;
export function warmLobby() {
  if (lobbyWarmed) return;
  lobbyWarmed = true;
  initSkinCarousel();
  initMapCarousel();
}

export function showRoom() {
  warmLobby();
  const r = S.room;
  if (!r) return;
  // one-shot from the home "Play vs bots" button: fill the private room and ready up
  try {
    const fill = sessionStorage.getItem('shooty.fillBots');
    if (fill && !r.gameOn) {
      sessionStorage.removeItem('shooty.fillBots');
      send({ type: 'fillBots', level: fill });
      if (sessionStorage.getItem('shooty.autoReady')) {
        sessionStorage.removeItem('shooty.autoReady');
        setTimeout(() => send({ type: 'ready' }), 120);
      }
    }
  } catch {}
  $('roomCode').textContent = r.code;
  $('roomKind').textContent = r.private ? 'private' : 'public';
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('sel', b.dataset.mode === r.mode));
  document.body.classList.toggle('plague', r.mode === 'plague');
  const win = r.winScore ?? WIN_SCORE, teamWin = r.teamWinScore ?? TEAM_WIN_SCORE;
  $('modeHelp').textContent = r.mode === 'plague'
    ? `Infect everyone, or survive ${PLAGUE_DURATION / 60000} minutes. Monsters are fast and claw to infect.`
    : r.mode === 'teams' ? `Red vs blue. First team to ${teamWin} kills wins.`
    : r.mode === 'snipers' ? `Sniper, crossbow, and beam rifle only. First to ${win} kills wins.`
    : `Every player for themselves. First to ${win} kills wins.`;
  document.body.classList.toggle('snipers', r.mode === 'snipers');
  const scoreOn = r.mode === 'ffa' || r.mode === 'snipers' || r.mode === 'teams';
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

  const teams = r.mode === 'teams';
  const me = r.players.find(p => p.id === S.myId);
  // server is source of truth — revert a local pick the server rejected (e.g. unknown skin)
  if (me && me.skin && PLAYER_SKIN_NAMES[me.skin] && me.skin !== savedSkin()) {
    saveSkin(me.skin);
    browsedSkin = me.skin;
    if (skinCarouselBuilt) scrollToSkin(me.skin, true);
  }
  $('roster').replaceChildren(...[...r.players].sort((a, b) => r.mode === 'plague' && !r.gameOn ? a.id - b.id : a.team - b.team).map(p => {
    const li = document.createElement('li');
    li.dataset.id = p.id; // voice.js lights up whoever is talking
    if (isTeamMode(r.mode) && (teams || r.gameOn)) li.classList.add('team' + p.team);
    if (manual && !r.gameOn) li.classList.add('team' + p.plagueStartTeam, 'plague-role-row');
    li.classList.toggle('ready', p.ready);
    li.classList.toggle('you', p.id === S.myId);
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === S.myId ? ' (you)' : '');
    const tag = document.createElement('span');
    tag.className = 'tag';
    const side = teams || (r.mode === 'plague' && r.gameOn) ? teamName(r.mode, p.team) + ' · ' : '';
    const skin = r.mode === 'plague' && r.gameOn && p.team === PLAGUE_TEAM ? 'Monster' : PLAYER_SKIN_NAMES[p.skin] || 'Witch';
    tag.textContent = side + skin + ' · ' + (p.ready ? 'READY' : 'NOT READY');
    li.append(name, tag);
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
  if (!skinCarouselBuilt) initSkinCarousel();
  else updateSkinButton();
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

  // what's needed before the match can start
  const ready = r.players.filter(p => p.ready).length, n = r.players.length;
  const btn = $('readyBtn');
  btn.disabled = !me || me.ready || r.gameOn || S.disconnected || r.plagueSetupValid === false;
  btn.textContent = me && me.ready ? 'Ready!' : "I'm Here";
  if (S.disconnected) return;
  $('waitMsg').textContent =
    r.gameOn ? 'Match in progress — joining...'
    : n < 2 ? 'Waiting for players — send friends the invite link, or fill with bots'
    : r.plagueSetupValid === false ? 'Choose at least one infected and one healthy player in the list above.'
    : me && me.ready ? `Waiting for everyone (${ready}/${n}) · map votes decide the arena`
    : `Vote a map, then click "I'm Here" (${ready}/${n} ready)`;
}
