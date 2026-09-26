// Lobby room panel: room code + invite link, quick play / new private room, mode, teams,
// who's here and ready, bots (local testing), and the ready button.
// Switching rooms reloads the page with a new ?room= code; your profile survives the reload.
import { TEAMS } from '/shared/config.js';
import { S } from './state.js';
import { send } from './net.js';
import { initAudio } from './audio.js';
import { toast } from './ui.js';

const $ = id => document.getElementById(id);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const inviteLink = code => location.origin + location.pathname + '?room=' + code;
export const goToRoom = code => { location.href = code ? '?room=' + code : location.pathname; };

export function initRoom() {
  $('readyBtn').addEventListener('click', () => { initAudio(); send({ type: 'ready' }); });
  document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => {
    initAudio();
    send({ type: 'level', level: b.dataset.level });
  }));
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => send({ type: 'mode', mode: b.dataset.mode })));
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

  const teams = r.mode === 'teams';
  $('roster').replaceChildren(...[...r.players].sort((a, b) => a.team - b.team).map(p => {
    const li = document.createElement('li');
    if (teams) li.classList.add('team' + p.team);
    li.classList.toggle('ready', p.ready);
    li.classList.toggle('you', p.id === S.myId);
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === S.myId ? ' (you)' : '');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = (teams ? TEAMS[p.team] + ' · ' : '') + (p.ready ? 'READY' : 'NOT READY');
    li.append(name, tag);
    return li;
  }));
  $('rosterHead').textContent = `PLAYERS ${r.players.length}/${r.max}`;
  $('teamPick').hidden = !teams || r.gameOn;
  document.querySelectorAll('#teamPick button').forEach(b => b.classList.toggle('sel', +b.dataset.team === S.myTeam));
  $('botCtl').hidden = !r.bots;

  // what's needed before the match can start
  const me = r.players.find(p => p.id === S.myId), ready = r.players.filter(p => p.ready).length, n = r.players.length;
  const btn = $('readyBtn');
  btn.disabled = !me || me.ready || r.gameOn || S.disconnected;
  btn.textContent = me && me.ready ? 'Ready!' : "I'm Here";
  if (S.disconnected) return;
  $('waitMsg').textContent =
    r.gameOn ? 'Match in progress — joining...'
    : n < 2 ? 'Waiting for players — send friends the invite link'
    : me && me.ready ? `Waiting for everyone to ready up (${ready}/${n})`
    : `Pick a level, then click "I'm Here" (${ready}/${n} ready)`;
}
