// DOM bits: lobby screen, center messages, toasts, HP bar, scoreboard and kill feed.
import { TEAMS } from '/shared/config.js';
import { S, nameOf, teamOf } from './state.js';
import { initRoom, showRoom } from './room.js';
import { initAccount } from './account.js';
import { initFriends } from './friends.js';
import { refreshChat } from './chat.js';

const $ = id => document.getElementById(id);
const wait = $('wait');

export function initLobby() {
  initRoom();
  initAccount();
  initFriends();
}

export function setWaitText(text) { $('waitMsg').textContent = text; }

// back to the lobby; `result` (e.g. "You won! Rematch?") stays until the next match starts
export function showWait(result) {
  wait.style.display = '';
  document.body.classList.remove('ingame');
  refreshChat();
  $('result').textContent = result || '';
  showRoom();
  if (document.pointerLockElement) document.exitPointerLock();
}
export function hideWait() {
  wait.style.display = 'none';
  document.body.classList.add('ingame');
  refreshChat();
  $('result').textContent = '';
  $('msg').style.opacity = 0;
}

export function applyLevelUI(name, theme) {
  document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('sel', b.dataset.level === name));
  const title = $('waitTitle');
  title.textContent = theme.name;
  title.style.color = theme.title;
  title.style.textShadow = '0 0 24px ' + theme.title + ', 0 0 60px rgba(' + theme.accent + ',0.4)';
  for (const el of [wait, $('corner')]) { // the corner buttons match the level too
    el.style.setProperty('--accent', theme.title);
    el.style.setProperty('--accent-rgb', theme.accent);
  }
  wait.style.background = 'radial-gradient(ellipse at 50% 0%, ' + theme.bg + ', #050507 65%)';
}

// center-screen text; fades after 1.5s unless persist
export function showMsg(text, persist) {
  const el = $('msg');
  el.textContent = text;
  el.style.opacity = 1;
  if (!persist) setTimeout(() => el.style.opacity = 0, 1500);
}

// small message in the corner (friend requests, errors, "link copied")
export function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('gone'), 3500);
  setTimeout(() => el.remove(), 4000);
}

// big animated banner drawn on the canvas (render/hud.js)
export function banner(text, gold) { S.bannerText = text; S.bannerT = performance.now(); S.bannerGold = gold; }

const FEED_MS = 5000;
export function pushFeed(msg) {
  S.feed.push({ killer: msg.killer, victim: msg.victim, weapon: msg.weapon, head: msg.head, backstab: msg.backstab, t: performance.now() });
  if (S.feed.length > 5) S.feed.shift();
  drawFeed();
}

// a name colored by side: you gold, teammates blue, enemies red
function nameSpan(id) {
  const el = document.createElement('span');
  el.textContent = nameOf(id);
  el.className = id === S.myId ? 'me' : S.room && S.room.mode === 'teams' && teamOf(id) === S.myTeam ? 'ally' : 'foe';
  return el;
}

function drawFeed() {
  $('feed').replaceChildren(...S.feed.map(k => {
    const row = document.createElement('div');
    if (k.killer !== null && k.killer !== undefined) row.append(nameSpan(k.killer));
    const w = document.createElement('span');
    w.className = 'weapon';
    w.textContent = ` [${k.weapon}${k.head ? ' HS' : k.backstab ? ' BS' : ''}] `;
    row.append(w, nameSpan(k.victim));
    return row;
  }));
}

// everyone in the room with their kills, most first
function scoreRows() {
  if (!S.room) return [];
  return S.room.players.map(p => ({
    id: p.id, team: p.team,
    kills: p.id === S.myId ? S.myKills : S.others[p.id] && S.others[p.id].cur ? S.others[p.id].cur.kills : 0,
  })).sort((a, b) => b.kills - a.kills);
}

let lastScores = '';
function drawScores() {
  const rows = scoreRows(), teams = S.room && S.room.mode === 'teams';
  const key = JSON.stringify([rows, teams, S.myTeam, S.room && S.room.players.map(p => p.name)]);
  if (key === lastScores) return; // only touch the DOM when something changed
  lastScores = key;
  const line = r => {
    const d = document.createElement('div');
    const k = document.createElement('b');
    k.textContent = r.kills;
    d.append(k, ' ', nameSpan(r.id));
    return d;
  };
  const out = [];
  if (teams) {
    for (const t of [1, 2]) {
      const h = document.createElement('div');
      h.className = 'teamHead team' + t;
      h.textContent = `${TEAMS[t]} ${rows.filter(r => r.team === t).reduce((n, r) => n + r.kills, 0)}`;
      out.push(h, ...rows.filter(r => r.team === t).map(line));
    }
  } else out.push(...rows.map(line));
  $('scores').replaceChildren(...out);
}

export function updateHud() {
  $('myhp').style.width = Math.max(0, S.me.hp) + '%';
  $('sk').textContent = S.myKills;
  drawScores();
  if (S.feed.length && performance.now() - S.feed[0].t > FEED_MS) { S.feed.shift(); drawFeed(); }
}
