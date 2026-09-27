// DOM bits: lobby screen, center messages, toasts, HP bar, scoreboard and kill feed.
import { MAX_HP, PLAGUE_MAX_HP, PLAGUE_TEAM, HEALTHY_TEAM, isTeamMode, teamName, MODE_NAMES, HACK_HP, WEAPONS, GUN_GAME_LADDER, gunGameGun } from '/shared/config.js';
import { LEVEL_NAMES } from '/shared/levels.js';
import { S, nameOf, isEnemy, spare } from './state.js';
import { settings } from './settings.js';
import { MAX_SPEED } from './constants.js';
import { initRoom, showRoom, scrollToMap } from './room.js';
import { initAccount } from './account.js';
import { initFriends } from './friends.js';
import { initHome } from './home.js';
import { refreshChat } from './chat.js';

const $ = id => document.getElementById(id);
const wait = $('wait');
const summary = $('summary');
let summaryTimer = 0;
let summaryNext = null;

export function initLobby() {
  initHome();
  initRoom();
  initAccount();
  initFriends();
  $('summaryContinue').addEventListener('click', dismissSummary);
}

export function setWaitText(text) { $('waitMsg').textContent = text; }

// back to the lobby; `result` (e.g. "You won! Rematch?") stays until the next match starts
export function showWait(result) {
  hideSummary(true);
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
  hideSummary(true);
}

export function applyLevelUI(name, _theme) {
  // leading = what the room is on / will play; sel/voted = what you picked (set in showRoom)
  document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('leading', b.dataset.level === name));
  scrollToMap(name); // the picked map slides to the middle of the carousel
  // keep lobby chrome fixed — no map-name title or accent wash per level
  for (const el of [wait, $('corner'), summary]) {
    el?.style.removeProperty('--accent');
    el?.style.removeProperty('--accent-rgb');
    el?.style.removeProperty('--wash');
  }
}

// center-screen text; fades after 1.5s unless persist
export function showMsg(text, persist) {
  const el = $('msg');
  el.textContent = text;
  el.style.opacity = 1;
  if (!persist) setTimeout(() => el.style.opacity = 0, 1500);
}

// post-match scoreboard; Continue (or auto) returns to the lobby rematch prompt
export function showSummary({ headline, rematch, scores, mode, level, won, hardpointScores }) {
  clearTimeout(summaryTimer);
  summaryNext = rematch || '';
  $('msg').style.opacity = 0;
  if (document.pointerLockElement) document.exitPointerLock();

  const head = $('summaryHeadline');
  head.textContent = headline;
  head.className = won ? 'won' : 'lost';

  const map = LEVEL_NAMES[level] || level || '';
  const modeLabel = MODE_NAMES[mode] || mode || '';
  const objectiveScore = mode === 'hardpoint' && hardpointScores
    ? `${teamName('hardpoint', 1)} ${hardpointScores[1] || 0} — ${teamName('hardpoint', 2)} ${hardpointScores[2] || 0}` : '';
  $('summarySub').textContent = [modeLabel, map, objectiveScore].filter(Boolean).join(' · ');

  const teams = isTeamMode(mode);
  const tbody = $('summaryBoard').tBodies[0];
  tbody.replaceChildren();
  (scores || []).forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.id === S.myId) tr.classList.add('you');
    if (r.winner) tr.classList.add('winner');
    if (teams && r.team) tr.classList.add('team' + r.team);
    const rank = document.createElement('td');
    rank.textContent = String(i + 1);
    const name = document.createElement('td');
    name.className = 'name';
    name.textContent = r.name || nameOf(r.id);
    const k = document.createElement('td');
    k.className = 'kills';
    k.textContent = String(r.kills ?? 0);
    const d = document.createElement('td');
    d.className = 'deaths';
    d.textContent = String(r.deaths ?? 0);
    tr.append(rank, name, k, d);
    tbody.appendChild(tr);
  });

  summary.hidden = false;
  summaryTimer = setTimeout(dismissSummary, 12000);
}

function dismissSummary() {
  if (summary.hidden) return;
  const next = summaryNext;
  hideSummary(true);
  showWait(next);
}

function hideSummary(silent) {
  clearTimeout(summaryTimer);
  summaryTimer = 0;
  summary.hidden = true;
  if (!silent) summaryNext = null;
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
// smaller line under the banner for kill streaks and multi-kills
export function callout(text) { S.calloutText = text; S.calloutT = performance.now(); }

const FEED_MS = 5000;
export function pushFeed(msg) {
  S.feed.push({ killer: msg.killer, victim: msg.victim, weapon: msg.weapon, head: msg.head, backstab: msg.backstab, infected: msg.infected, t: performance.now() });
  if (S.feed.length > 5) S.feed.shift();
  drawFeed();
}
// a line of text in the kill feed ("Hex Grim is on a RAMPAGE")
export function pushNote(text) {
  S.feed.push({ text, t: performance.now() });
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
    if (k.text) { row.className = 'note'; row.textContent = k.text; return row; }
    if (k.killer !== null && k.killer !== undefined) row.append(nameSpan(k.killer));
    const w = document.createElement('span');
    w.className = 'weapon';
    w.textContent = k.infected ? ' [INFECTED] ' : k.weapon === 'respawn' ? ' [RESPAWN] ' : k.weapon === 'zone' ? ' [STORM] ' : ` [${k.weapon}${k.head ? ' HS' : k.backstab ? ' BS' : ''}] `;
    row.append(w, nameSpan(k.victim));
    return row;
  }));
}

// everyone in the room with their kills, most first
// (gun game: which gun they're on instead of kills)
function scoreRows() {
  if (!S.room) return [];
  const gunGame = S.room.mode === 'gungame';
  return S.room.players.map(p => {
    const cur = p.id === S.myId ? { kills: S.myKills, gl: S.myGunLevel } : S.others[p.id]?.cur || { kills: 0, gl: 0 };
    return { id: p.id, team: p.team, kills: gunGame ? (cur.gl || 0) + 1 : cur.kills };
  }).sort((a, b) => b.kills - a.kills);
}

let lastScores = '';
function drawScores() {
  const rows = scoreRows(), mode = S.room && S.room.mode, teams = isTeamMode(mode);
  const hardpointScores = S.hardpoint?.scores || { 1: 0, 2: 0 };
  const key = JSON.stringify([rows, mode, S.myTeam, hardpointScores, S.room && S.room.players.map(p => p.name)]);
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
      h.textContent = mode === 'plague' ? `${teamName(mode, t)} (${members.length})`
        : mode === 'hardpoint' ? `${teamName(mode, t)} ${hardpointScores[t] || 0}`
        : `${teamName(mode, t)} ${members.reduce((n, r) => n + r.kills, 0)}`;
      out.push(h, ...rows.filter(r => r.team === t).map(line));
    }
  } else out.push(...rows.map(line));
  $('scores').replaceChildren(...out);
}

const clock = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function updateHud() {
  const maxHp = S.hacks ? HACK_HP : S.room?.mode === 'plague' && S.myTeam === PLAGUE_TEAM ? PLAGUE_MAX_HP : MAX_HP;
  $('myhp').style.width = Math.max(0, Math.min(100, S.me.hp / maxHp * 100)) + '%';
  $('sk').textContent = S.myKills;
  const badge = $('hackBadge');
  if (badge) badge.hidden = !S.hacks;
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
  const hardpoint = S.started && S.room?.mode === 'hardpoint' && S.hardpoint;
  const hardpointEl = $('hardpointStatus');
  hardpointEl.hidden = !hardpoint;
  hardpointEl.classList.toggle('contested', !!hardpoint?.contested);
  hardpointEl.classList.toggle('friendly', !!hardpoint?.owner && !hardpoint.contested && hardpoint.owner === S.myTeam);
  hardpointEl.classList.toggle('enemy', !!hardpoint?.owner && !hardpoint.contested && hardpoint.owner !== S.myTeam);
  if (hardpoint) {
    if (hardpoint.active) {
      $('hardpointRole').textContent = `HARDPOINT ${hardpoint.index + 1} / ${hardpoint.count}`;
      $('hardpointObjective').textContent = hardpoint.contested ? 'CONTESTED · SCORING PAUSED'
        : hardpoint.owner ? `${teamName('hardpoint', hardpoint.owner)} CONTROLS THE HILL` : 'HILL UNCLAIMED';
      $('hardpointClock').textContent = hardpoint.overtime
        ? `OVERTIME · HILL ROTATES IN ${clock(hardpoint.hillRemainingMs)}`
        : `MATCH ${clock(hardpoint.matchRemainingMs)} · HILL ${clock(hardpoint.hillRemainingMs)}`;
    } else {
      $('hardpointRole').textContent = 'HARDPOINT INCOMING';
      $('hardpointObjective').textContent = `POINT ${hardpoint.next.index + 1} / ${hardpoint.count} · GET IN POSITION`;
      $('hardpointClock').textContent = `MATCH ${clock(hardpoint.matchRemainingMs)} · OPENS IN ${clock(hardpoint.activatesInMs)}`;
    }
  }
  updateModeStatus();
  drawScores();
  updateSpeedHud();
  updateAmmoHud();
  $('feed').hidden = !settings.showFeed;
  if (S.feed.length && performance.now() - S.feed[0].t > FEED_MS) { S.feed.shift(); drawFeed(); }
}

// gun game: your rung and who's leading; battle royale: who's left and what the storm is doing
function updateModeStatus() {
  const mode = S.started && S.room?.mode, el = $('modeStatus');
  el.hidden = mode !== 'gungame' && !(mode === 'royale' && S.zone);
  el.classList.toggle('storm', mode === 'royale' && !!S.zone?.shrinking);
  if (mode === 'gungame') {
    const lvl = S.myGunLevel, last = GUN_GAME_LADDER.length - 1;
    let lead = { id: S.myId, gl: lvl };
    for (const [id, o] of Object.entries(S.others)) if ((o.cur?.gl || 0) > lead.gl) lead = { id: +id, gl: o.cur.gl };
    $('modeRole').textContent = `GUN ${lvl + 1} / ${last + 1} · ${gunGameGun(lvl).toUpperCase()}`;
    $('modeClock').textContent = '';
    $('modeObjective').textContent = (lvl >= last ? 'Blade kill to win' : 'Next: ' + gunGameGun(lvl + 1).toUpperCase())
      + (lead.id === S.myId ? ' · You lead' : ` · ${nameOf(lead.id)} leads (${lead.gl + 1})`);
  } else if (mode === 'royale' && S.zone) {
    const z = S.zone, left = clock(S.zoneEndsAt - performance.now()), final = z.stage >= z.stages - 1;
    $('modeRole').textContent = `${z.alive} ALIVE`;
    $('modeClock').textContent = z.shrinking ? left : '';
    $('modeObjective').textContent = z.shrinking ? 'STORM CLOSING IN' : final && !z.ms ? 'THE STORM HAS CLOSED' : 'STORM MOVES IN ' + left;
  }
}

function updateSpeedHud() {
  const el = $('speedHud');
  if (!el) return;
  const n = Math.round(S.speed * 320 / MAX_SPEED);
  el.textContent = n + ' u/s';
  el.classList.toggle('fast', S.speed > MAX_SPEED + 0.1);
}

function updateAmmoHud() {
  const el = $('ammoHud'), w = S.weapon;
  if (!el) return;
  if (S.dead || w === 'blade' || w === 'claws' || !WEAPONS[w]) { el.hidden = true; return; }
  el.hidden = false;
  const mag = S.mag[w] ?? 0, full = WEAPONS[w].mag, left = spare(w);
  $('ammoWeapon').textContent = w;
  const count = $('ammoCount');
  count.innerHTML = '';
  count.append(document.createTextNode(String(mag)));
  const spareEl = document.createElement('span');
  spareEl.className = 'spare';
  spareEl.textContent = ' / ' + left;
  count.append(spareEl);
  count.classList.toggle('empty', mag === 0);
  count.classList.toggle('low', mag > 0 && mag <= full / 4);
}
