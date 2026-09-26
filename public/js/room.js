// Lobby room panel: room code + invite link, quick play / new private room, mode, teams,
// who's here and ready, bots, and the ready button.
// Switching rooms reloads the page with a new ?room= code; your profile survives the reload.
import { TEAMS } from '/shared/config.js';
import { S } from './state.js';
import { send } from './net.js';
import { initAudio } from './audio.js';
import { toast } from './ui.js';
import { PLAYER_SKIN_NAMES, PLAYER_SPRITES } from './render/sprites.js';
import { savedSkin, saveSkin } from './profile.js';
import { LEVELS } from '/shared/levels.js';
import { buildTerrain } from '/shared/terrain.js';
import { THEMES } from './themes.js';
import { muted, toggleMute, voiceOn } from './voice.js';

const $ = id => document.getElementById(id);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SKINS = Object.keys(PLAYER_SKIN_NAMES);
let browsedSkin = 'demon';

function renderSkinPreview(canvas, skin) {
  const sprite = PLAYER_SPRITES[skin], ctx = canvas.getContext('2d');
  canvas.width = 36; canvas.height = 54;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const color = sprite.pal[sprite.px((x + 0.5) / canvas.width, (y + 0.5) / canvas.height, true)];
    if (!color) continue;
    ctx.fillStyle = 'rgb(' + color.join(',') + ')';
    ctx.fillRect(x, y, 1, 1);
  }
}

function renderSkinWheel(direction) {
  const current = SKINS.indexOf(browsedSkin), wheel = $('skinWheel');
  wheel.dataset.direction = direction || '';
  wheel.replaceChildren();
  [-1, 0, 1].forEach(offset => {
    const skin = SKINS[(current + offset + SKINS.length) % SKINS.length];
    const card = document.createElement('div');
    card.className = 'skin-preview' + (offset ? (offset < 0 ? ' side left' : ' side right') : ' front');
    const canvas = document.createElement('canvas');
    renderSkinPreview(canvas, skin);
    const label = document.createElement('span');
    label.textContent = PLAYER_SKIN_NAMES[skin];
    card.append(canvas, label);
    wheel.append(card);
  });
  const chosen = savedSkin() === browsedSkin;
  $('chooseSkin').textContent = chosen ? 'SELECTED' : 'SELECT CHARACTER';
  $('chooseSkin').disabled = chosen || !!(S.room && S.room.gameOn);
}

// --- map carousel: scroll or swipe through the maps, arrows step one card; clicking a card picks it ---
const cards = () => [...document.querySelectorAll('#levels button')];

// a top-down picture of each map on its card, in the level's minimap colors
function drawMapPreview(b) {
  const name = b.dataset.level, T = buildTerrain(LEVELS[name], 3, name), c = document.createElement('canvas');
  c.className = 'preview'; c.width = T.TW; c.height = T.TH;
  const g = c.getContext('2d'), img = g.createImageData(T.TW, T.TH), cols = THEMES[name].minimap;
  for (let k = 0; k < T.TW * T.TH; k++) { const col = cols[T.kind[k]]; img.data.set([col[0], col[1], col[2], 255], k * 4); }
  g.putImageData(img, 0, 0);
  b.prepend(c);
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
  cards().forEach(drawMapPreview);
  const step = dir => {
    const list = cards(), i = list.indexOf(centered());
    scrollToMap(list[(i + dir + list.length) % list.length].dataset.level);
  };
  $('mapPrev').addEventListener('click', () => step(-1));
  $('mapNext').addEventListener('click', () => step(1));
  // a mouse wheel scrolls the strip sideways
  strip.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    strip.scrollBy({ left: e.deltaY });
  }, { passive: false });
  const mark = () => { const c = centered(); cards().forEach(b => b.classList.toggle('centered', b === c)); };
  strip.addEventListener('scroll', mark);
  requestAnimationFrame(mark);
}

export const inviteLink = code => location.origin + location.pathname + '?room=' + code;
export const goToRoom = code => { location.href = code ? '?room=' + code : location.pathname; };

export function initRoom() {
  browsedSkin = PLAYER_SKIN_NAMES[savedSkin()] ? savedSkin() : 'demon';
  $('skinPrev').addEventListener('click', () => {
    browsedSkin = SKINS[(SKINS.indexOf(browsedSkin) - 1 + SKINS.length) % SKINS.length];
    renderSkinWheel('previous');
  });
  $('skinNext').addEventListener('click', () => {
    browsedSkin = SKINS[(SKINS.indexOf(browsedSkin) + 1) % SKINS.length];
    renderSkinWheel('next');
  });
  $('chooseSkin').addEventListener('click', () => {
    saveSkin(browsedSkin);
    send({ type: 'skin', skin: browsedSkin });
    renderSkinWheel();
  });
  renderSkinWheel();
  $('readyBtn').addEventListener('click', () => { initAudio(); send({ type: 'ready' }); });
  document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => {
    initAudio();
    send({ type: 'level', level: b.dataset.level });
  }));
  initMapCarousel();
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => send({ type: 'mode', mode: b.dataset.mode })));
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
  $('addBot').addEventListener('click', () => send({ type: 'addBot', level: botLevel }));
  $('removeBot').addEventListener('click', () => send({ type: 'removeBot' }));

  $('copyLink').addEventListener('click', async () => {
    if (!S.room) return;
    const link = inviteLink(S.room.code);
    try { await navigator.clipboard.writeText(link); toast('Invite link copied'); }
    catch { toast(link); } // clipboard blocked (plain http on another device): show it to copy by hand
  });
  $('quickPlay').addEventListener('click', () => goToRoom(null));
  $('newRoom').addEventListener('click', () => goToRoom(Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')));
}

export function showRoom() {
  const r = S.room;
  if (!r) return;
  $('roomCode').textContent = r.code;
  $('roomKind').textContent = r.private ? 'private' : 'public';
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('sel', b.dataset.mode === r.mode));

  const teams = r.mode === 'teams';
  const me = r.players.find(p => p.id === S.myId);
  $('roster').replaceChildren(...[...r.players].sort((a, b) => a.team - b.team).map(p => {
    const li = document.createElement('li');
    li.dataset.id = p.id; // voice.js lights up whoever is talking
    if (teams) li.classList.add('team' + p.team);
    li.classList.toggle('ready', p.ready);
    li.classList.toggle('you', p.id === S.myId);
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === S.myId ? ' (you)' : '');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = (teams ? TEAMS[p.team] + ' · ' : '') + (PLAYER_SKIN_NAMES[p.skin] || 'Demon') + ' · ' + (p.ready ? 'READY' : 'NOT READY');
    li.append(name, tag);
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
  renderSkinWheel();
  $('teamPick').hidden = !teams || r.gameOn;
  document.querySelectorAll('#teamPick button').forEach(b => b.classList.toggle('sel', +b.dataset.team === S.myTeam));
  $('botCtl').hidden = false;
  $('addBot').disabled = r.players.length >= r.max;
  $('removeBot').disabled = !r.players.some(p => p.bot);

  // what's needed before the match can start
  const ready = r.players.filter(p => p.ready).length, n = r.players.length;
  const btn = $('readyBtn');
  btn.disabled = !me || me.ready || r.gameOn || S.disconnected;
  btn.textContent = me && me.ready ? 'Ready!' : "I'm Here";
  if (S.disconnected) return;
  $('waitMsg').textContent =
    r.gameOn ? 'Match in progress — joining...'
    : n < 2 ? 'Waiting for players — send friends the invite link, or add a bot'
    : me && me.ready ? `Waiting for everyone to ready up (${ready}/${n})`
    : `Pick a level, then click "I'm Here" (${ready}/${n} ready)`;
}
