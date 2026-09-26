// Lobby room panel: room code + invite link, quick play / new private room, mode, teams,
// who's here and ready, bots, and the ready button.
// Switching rooms reloads the page with a new ?room= code; your profile survives the reload.
import { WIN_SCORE, TEAM_WIN_SCORE, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, PLAGUE_SPEED_MULTIPLIER, PLAGUE_MAX_HP, isTeamMode, teamName } from '/shared/config.js';
import { S } from './state.js';
import { send } from './net.js';
import { initAudio } from './audio.js';
import { toast } from './ui.js';
import { PLAYER_SKIN_NAMES, PLAYER_SPRITES } from './render/sprites.js';
import { savedSkin, saveSkin } from './profile.js';

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
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => send({ type: 'mode', mode: b.dataset.mode })));
  document.querySelectorAll('#plagueSelection button').forEach(b => b.addEventListener('click', () => send({ type: 'plagueSetup', selection: b.dataset.selection })));
  document.querySelectorAll('#teamPick button').forEach(b => b.addEventListener('click', () => send({ type: 'team', team: +b.dataset.team })));
  $('addBot').addEventListener('click', () => send({ type: 'addBot' }));
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
  document.body.classList.toggle('plague', r.mode === 'plague');
  $('modeHelp').textContent = r.mode === 'plague'
    ? `Infected monsters have ${PLAGUE_MAX_HP} health, move ${PLAGUE_SPEED_MULTIPLIER} times as fast, and can double jump and dash. Use the shoot button to attack with claws; two hits infect a full-health survivor. Infect everyone, or stay healthy for ${PLAGUE_DURATION / 60000} minutes to win. No friendly fire.`
    : r.mode === 'teams' ? `Red vs blue. First team to ${TEAM_WIN_SCORE} kills wins.` : `Every player for themselves. First to ${WIN_SCORE} kills wins.`;
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
  $('roster').replaceChildren(...[...r.players].sort((a, b) => r.mode === 'plague' && !r.gameOn ? a.id - b.id : a.team - b.team).map(p => {
    const li = document.createElement('li');
    if (isTeamMode(r.mode) && (teams || r.gameOn)) li.classList.add('team' + p.team);
    if (manual && !r.gameOn) li.classList.add('team' + p.plagueStartTeam, 'plague-role-row');
    li.classList.toggle('ready', p.ready);
    li.classList.toggle('you', p.id === S.myId);
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === S.myId ? ' (you)' : '');
    const tag = document.createElement('span');
    tag.className = 'tag';
    const side = teams || (r.mode === 'plague' && r.gameOn) ? teamName(r.mode, p.team) + ' · ' : '';
    const skin = r.mode === 'plague' && r.gameOn && p.team === PLAGUE_TEAM ? 'Monster' : PLAYER_SKIN_NAMES[p.skin] || 'Demon';
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
  btn.disabled = !me || me.ready || r.gameOn || S.disconnected || r.plagueSetupValid === false;
  btn.textContent = me && me.ready ? 'Ready!' : "I'm Here";
  if (S.disconnected) return;
  $('waitMsg').textContent =
    r.gameOn ? 'Match in progress — joining...'
    : n < 2 ? 'Waiting for players — send friends the invite link, or add a bot'
    : r.plagueSetupValid === false ? 'Choose at least one infected and one healthy player in the list above.'
    : me && me.ready ? `Waiting for everyone to ready up (${ready}/${n})`
    : `Pick a level, then click "I'm Here" (${ready}/${n} ready)`;
}
