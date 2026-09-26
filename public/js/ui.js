// DOM bits: lobby screen, center messages, toasts, HP bar, scoreboard and kill feed.
import { MAX_HP, PLAGUE_MAX_HP, PLAGUE_TEAM, HEALTHY_TEAM, isTeamMode, teamName } from '/shared/config.js';
import { S, nameOf, isEnemy } from './state.js';
import { settings } from './settings.js';
import { initRoom, showRoom, scrollToMap } from './room.js';
import { initAccount } from './account.js';
import { initFriends } from './friends.js';
import { initHome } from './home.js';
import { refreshChat } from './chat.js';

const $ = id => document.getElementById(id);
const wait = $('wait');

export function initLobby() {
  initHome();
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
  // leading = what the room is on / will play; sel/voted = what you picked (set in showRoom)
  document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('leading', b.dataset.level === name));
  scrollToMap(name); // the picked map slides to the middle of the carousel
  const title = $('waitTitle');
  title.textContent = theme.name;
  title.style.color = theme.title;
  title.style.textShadow = '';
  for (const el of [wait, $('corner')]) { // the corner buttons match the level too
    el.style.setProperty('--accent', theme.title);
    el.style.setProperty('--accent-rgb', theme.accent);
    el.style.setProperty('--wash', theme.bg);
  }
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
  S.feed.push({ killer: msg.killer, victim: msg.victim, weapon: msg.weapon, head: msg.head, backstab: msg.backstab, infected: msg.infected, t: performance.now() });
  if (S.feed.length > 5) S.feed.shift();
  drawFeed();
}

// a name colored by side: you gold, teammates blue, enemies red
function nameSpan(id) {
  const el = document.createElement('span');
  el.textContent = nameOf(id);
  el.className = id === S.myId ? 'me' : isEnemy(id) ? 'foe' : 'ally';
  return el;
}

function drawFeed() {
  const el = $('feed');
  if (!settings.showFeed) { el.replaceChildren(); return; }
  el.replaceChildren(...S.feed.map(k => {
    const row = document.createElement('div');
    if (k.killer !== null && k.killer !== undefined) row.append(nameSpan(k.killer));
    const w = document.createElement('span');
    w.className = 'weapon';
    w.textContent = k.infected ? ' [INFECTED] ' : ` [${k.weapon}${k.head ? ' HS' : k.backstab ? ' BS' : ''}] `;
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
  const rows = scoreRows(), mode = S.room && S.room.mode, teams = isTeamMode(mode);
  const key = JSON.stringify([rows, mode, S.myTeam, S.room && S.room.players.map(p => p.name)]);
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
      const members = rows.filter(r => r.team === t);
      h.textContent = mode === 'plague' ? `${teamName(mode, t)} (${members.length})` : `${teamName(mode, t)} ${members.reduce((n, r) => n + r.kills, 0)}`;
      out.push(h, ...rows.filter(r => r.team === t).map(line));
    }
  } else out.push(...rows.map(line));
  $('scores').replaceChildren(...out);
}

export function updateHud() {
  const maxHp = S.room?.mode === 'plague' && S.myTeam === PLAGUE_TEAM ? PLAGUE_MAX_HP : MAX_HP;
  $('myhp').style.width = Math.max(0, Math.min(100, S.me.hp / maxHp * 100)) + '%';
  $('sk').textContent = S.myKills;
  const plague = S.started && S.room?.mode === 'plague';
  $('plagueStatus').hidden = !plague;
  if (plague) {
    const infected = S.myTeam === PLAGUE_TEAM;
    const healthy = S.room.players.filter(p => p.team === HEALTHY_TEAM).length;
    const seconds = Math.max(0, Math.ceil((S.plagueEndsAt - performance.now()) / 1000));
    $('plagueStatus').classList.toggle('infected', infected);
    $('plagueRole').textContent = infected ? 'YOU ARE PLAGUE' : 'YOU ARE HEALTHY';
    $('plagueClock').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    $('plagueObjective').textContent = `${healthy} healthy remaining · ${infected ? 'Infect everyone' : 'Survive until time runs out'}`;
  }
  drawScores();
  $('feed').hidden = !settings.showFeed;
  if (S.feed.length && performance.now() - S.feed[0].t > FEED_MS) { S.feed.shift(); drawFeed(); }
}
