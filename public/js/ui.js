// DOM bits: lobby screen, center messages, toasts, HP bar, scoreboard and kill feed.
import { canBuildIn, MAX_MANA, MAX_HP, PLAGUE_MAX_HP, PLAGUE_TEAM, HEALTHY_TEAM, isTeamMode, teamName, MODE_NAMES, HACK_HP, WEAPONS, GUN_GAME_LADDER, gunGameGun, magSize, ELIXIR_HP, gunName } from '/shared/config.js';
import { LEVEL_NAMES, FEATURED_LEVELS } from '/shared/levels.js';
import { levelFor } from '/shared/progression.js';
import { S, nameOf, isEnemy, spare } from './state.js';
import { settings } from './settings.js';
import { initRoom, showRoom, updateLoadout, hideLoading } from './room.js';
import { initAccount } from './account.js';
import { initFriends } from './friends.js';
import { initHome } from './home.js';
import { refreshChat } from './chat.js';
import { send } from './net.js';
import { initAudio, syncMusic } from './audio.js';
import { startMotes } from './motes.js';

const $ = id => document.getElementById(id);
const wait = $('wait');
const summary = $('summary');
let summaryTimer = 0;
let summaryNext = null;
let rematchAsked = false; // clicked REMATCH: stay on the results until the next match starts

export function initLobby() {
  initHome();
  initRoom();
  initAccount();
  initFriends();
  $('summaryContinue').addEventListener('click', dismissSummary);
  $('summaryRematch').addEventListener('click', rematch);
  initRolls();
  startMotes();
  // browsers only allow sound after you interact: the first click or key starts the lobby music
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, initAudio, { once: true, capture: true });
}

// side cards (friends, messages, profile, leaderboard) roll up like a scroll with Shrink;
// remembered per card in this browser
let rolledCards = {};
// a pointed gothic arch with a star under it: points up to roll the card up, turns over when rolled
const ROLL_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 13 L10 5 L16.5 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/><path d="M10 14.2 l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="currentColor"/></svg>';
export function setRolled(card, on) {
  card.classList.toggle('rolled', on);
  const b = card.querySelector('.roll');
  b.title = on ? 'Unroll' : 'Roll up';
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-expanded', String(!on));
  if (!on) card.dispatchEvent(new Event('unroll'));
  rolledCards[card.id] = on;
  try { localStorage.setItem('shooty.rolled', JSON.stringify(rolledCards)); } catch {}
}
function initRolls() {
  try { rolledCards = JSON.parse(localStorage.getItem('shooty.rolled')) || {}; } catch {}
  document.querySelectorAll('.card .roll').forEach(b => {
    const card = b.closest('.card');
    b.innerHTML = ROLL_ICON; b.title = 'Roll up'; b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => setRolled(card, !card.classList.contains('rolled')));
    if (rolledCards[card.id]) setRolled(card, true);
  });
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
  syncMusic();
  startMotes();
  if (document.pointerLockElement) document.exitPointerLock();
}
export function hideWait() {
  wait.style.display = 'none';
  document.body.classList.add('ingame');
  refreshChat();
  $('result').textContent = '';
  $('msg').style.opacity = 0;
  $('picker').hidden = true;
  hideLoading();
  hideSummary(true);
  syncMusic(); // the lobby tune fades out for the match
}

export function applyLevelUI(name, _theme) {
  // leading = what the room is on / will play; sel/voted = what you picked (set in showRoom)
  document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('leading', b.dataset.level === name));
  if (S.room) updateLoadout(); // the lobby summary shows the leading realm
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

// post-match scoreboard; REMATCH readies you for the same map and mode right here, LOBBY (or
// waiting) goes back to the lobby
export function showSummary({ headline, rematch, scores, mode, level, won, hardpointScores, ctfScores, soulScores, wave }) {
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
    ? `${teamName('hardpoint', 1)} ${hardpointScores[1] || 0} — ${teamName('hardpoint', 2)} ${hardpointScores[2] || 0}`
    : mode === 'ctf' && ctfScores ? `${teamName('ctf', 1)} ${ctfScores[1] || 0} — ${teamName('ctf', 2)} ${ctfScores[2] || 0} captures`
    : mode === 'harvest' && soulScores ? `${teamName('harvest', 1)} ${soulScores[1] || 0} — ${teamName('harvest', 2)} ${soulScores[2] || 0} souls`
    : mode === 'survival' && wave ? `Reached wave ${wave}` : '';
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

  rematchAsked = false;
  summary.hidden = false;
  updateRematch();
  showXpGain();
  summaryTimer = setTimeout(dismissSummary, 12000);
}

// vote buttons for the next map and mode (the same votes as the lobby); the leading one is outlined
function showVotes() {
  const r = S.room;
  if (!r) return;
  const me = r.players.find(p => p.id === S.myId);
  const row = (el, keys, names, counts, mine, leading, vote) => el.replaceChildren(...keys.map(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = names[k] + (counts[k] ? ' · ' + counts[k] : '');
    b.classList.toggle('mine', mine === k);
    b.classList.toggle('leading', leading === k);
    b.disabled = r.gameOn;
    b.addEventListener('click', () => vote(k));
    return b;
  }));
  row($('summaryMaps'), FEATURED_LEVELS, LEVEL_NAMES, r.votes || {}, me?.vote, r.level, level => castVote({ type: 'vote', level }));
  const fixed = (me?.modeVote || r.mode) === 'survival'; // the Crypt, always
  $('summaryMaps').querySelectorAll('button').forEach(b => { b.disabled = b.disabled || fixed; });
  $('summaryMaps').title = fixed ? 'Wave Survival always plays in the Crypt' : '';
  row($('summaryModes'), Object.keys(MODE_NAMES), MODE_NAMES, r.modeVotes || {}, me?.modeVote, r.mode, mode => castVote({ type: 'mode', mode }));
}

function castVote(msg) {
  clearTimeout(summaryTimer); // voting means you're staying for another round
  send(msg);
  if (rematchAsked) send({ type: 'ready' }); // a vote un-readies you; keep your rematch
}

function rematch() {
  if (rematchAsked) return;
  initAudio();
  rematchAsked = true;
  clearTimeout(summaryTimer); // don't drift off to the lobby while waiting for the others
  send({ type: 'ready' });
  updateRematch();
}

// the REMATCH button, who it's waiting on and the map / mode votes for the next match; called
// again whenever the room changes
export function updateRematch() {
  if (summary.hidden) return;
  showVotes();
  const btn = $('summaryRematch'), players = S.room?.players || [];
  const humans = players.filter(p => !p.bot), ready = humans.filter(p => p.ready).length;
  btn.disabled = rematchAsked || S.disconnected;
  btn.textContent = rematchAsked ? 'WAITING…' : 'REMATCH';
  $('summaryWait').textContent = !rematchAsked ? ''
    : players.length < 2 ? 'Waiting for another player to join'
    : `Waiting for players (${ready}/${humans.length} ready)`;
}

function dismissSummary() {
  if (summary.hidden) return;
  const next = summaryNext;
  hideSummary(true);
  showWait(next);
}

// "+45 XP · Level 3" on the match summary; the award lands a moment after the result, so this
// runs again when the new XP arrives
export function showXpGain() {
  const el = $('summaryXp');
  if (!el || summary.hidden || S.xpStart === null) return;
  const gained = S.xp - S.xpStart;
  el.textContent = gained > 0 ? `+${gained} XP · Level ${levelFor(S.xp)}` : '';
}

function hideSummary(silent) {
  clearTimeout(summaryTimer);
  rematchAsked = false;
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
export function clearFeed() { S.feed = []; drawFeed(); }

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
export function scoreRows() {
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
  const key = JSON.stringify([rows, mode, S.myTeam, hardpointScores, S.soulScores, S.survival?.w, S.room && S.room.players.map(p => p.name)]);
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
  if (mode === 'survival') {
    const h = document.createElement('div');
    h.className = 'teamHead team1';
    h.textContent = `SURVIVORS · WAVE ${S.survival?.w || 0}`;
    out.push(h, ...rows.map(line));
  } else if (teams) {
    for (const t of [1, 2]) {
      const h = document.createElement('div');
      h.className = 'teamHead team' + t;
      const members = rows.filter(r => r.team === t);
      h.textContent = mode === 'plague' ? `${teamName(mode, t)} (${members.length})`
        : mode === 'hardpoint' ? `${teamName(mode, t)} ${hardpointScores[t] || 0}`
        : mode === 'ctf' ? `${teamName(mode, t)} ${S.ctf?.scores?.[t] || 0} ⚱`
        : mode === 'harvest' ? `${teamName(mode, t)} ${S.soulScores?.[t] || 0} ✦`
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
  const maxHp = S.hacks ? HACK_HP : S.room?.mode === 'plague' && S.myTeam === PLAGUE_TEAM ? PLAGUE_MAX_HP
    : (S.room?.mode === 'survival' ? MAX_HP : S.custom?.hp ?? MAX_HP) + (S.elixirs?.troll ? ELIXIR_HP : 0);
  $('myhp').style.width = Math.max(0, Math.min(100, S.me.hp / maxHp * 100)) + '%';
  $('mymana').style.width = Math.max(0, Math.min(100, S.mana / MAX_MANA * 100)) + '%';
  $('mymana').parentElement.hidden = !canBuildIn(S.room?.mode); // mana only buys ramps
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
  updateAmmoHud();
  $('feed').hidden = !settings.showFeed;
  if (S.feed.length && performance.now() - S.feed[0].t > FEED_MS) { S.feed.shift(); drawFeed(); }
}

// gun game: your rung and who's leading; battle royale: who's left and what the storm is doing
function updateModeStatus() {
  const mode = S.started && S.room?.mode, el = $('modeStatus');
  el.hidden = mode !== 'gungame' && !(mode === 'royale' && S.zone) && !(mode === 'ctf' && S.ctf) && !['harvest', 'chamber', 'survival'].includes(mode);
  el.classList.toggle('storm', mode === 'royale' && !!S.zone?.shrinking);
  if (mode === 'gungame') {
    const lvl = S.myGunLevel, last = GUN_GAME_LADDER.length - 1;
    let lead = { id: S.myId, gl: lvl };
    for (const [id, o] of Object.entries(S.others)) if ((o.cur?.gl || 0) > lead.gl) lead = { id: +id, gl: o.cur.gl };
    $('modeRole').textContent = `GUN ${lvl + 1} / ${last + 1} · ${gunName(gunGameGun(lvl)).toUpperCase()}`;
    $('modeClock').textContent = '';
    $('modeObjective').textContent = (lvl >= last ? 'Blade kill to win' : 'Next: ' + gunName(gunGameGun(lvl + 1)).toUpperCase())
      + (lead.id === S.myId ? ' · You lead' : ` · ${nameOf(lead.id)} leads (${lead.gl + 1})`);
  } else if (mode === 'ctf' && S.ctf) {
    const f = S.ctf, mine = f.c[S.myTeam], theirs = f.c[3 - S.myTeam], them = teamName('ctf', 3 - S.myTeam);
    $('modeRole').textContent = `${teamName('ctf', 1)} ${f.scores[1]} — ${f.scores[2]} ${teamName('ctf', 2)}`;
    $('modeClock').textContent = clock(f.ms);
    $('modeObjective').textContent = theirs?.carrier === S.myId ? (mine?.home ? 'Bring it home to your base!' : 'Your cauldron is gone — wait for it to come home')
      : mine && mine.carrier != null ? `${nameOf(mine.carrier)} has your cauldron — stop them!`
      : mine && !mine.home ? 'Your cauldron is on the ground — touch it to send it home'
      : theirs && theirs.carrier != null ? `${nameOf(theirs.carrier)} has the ${them} cauldron — cover them`
      : `Steal the ${them} cauldron`;
  } else if (mode === 'harvest') {
    const sc = S.soulScores || { 1: 0, 2: 0 }, us = teamName('harvest', S.myTeam), them = teamName('harvest', 3 - S.myTeam);
    $('modeRole').textContent = `${teamName('harvest', 1)} ${sc[1]} — ${sc[2]} ${teamName('harvest', 2)}`;
    $('modeClock').textContent = '';
    const near = S.souls.filter(o => Math.hypot(o.x - S.me.x, o.y - S.me.y) < 12);
    $('modeObjective').textContent = `First to ${S.soulWin || S.room.soulWinScore} souls · `
      + (near.some(o => o.t !== S.myTeam) ? `${them} soul nearby — reap it!` : near.some(o => o.t === S.myTeam) ? `${us} soul nearby — deny it!` : 'Kill, then grab the soul');
  } else if (mode === 'chamber') {
    const alive = (S.room?.players || []).filter(p => p.id === S.myId ? S.lives > 0 : (S.others[p.id]?.cur?.lv ?? 1) > 0).length;
    $('modeRole').textContent = (S.lives > 0 ? '♥'.repeat(S.lives) : 'OUT') + ` · ${alive} LEFT`;
    $('modeClock').textContent = '';
    $('modeObjective').textContent = (S.mag.pistol > 0 ? `${S.mag.pistol} round${S.mag.pistol === 1 ? '' : 's'} loaded — make it count` : 'No rounds — get a blade kill');
  } else if (mode === 'survival' && S.survival) {
    const v = S.survival;
    $('modeRole').textContent = `WAVE ${v.w || 0} · ${S.gold} GOLD`;
    $('modeClock').textContent = v.ph === 'break' ? clock(v.ms) : '';
    const boosts = [v.db ? `DOUBLE GOLD ${Math.ceil(v.db / 1000)}s` : '', v.ik ? `INSTA-KILL ${Math.ceil(v.ik / 1000)}s` : ''].filter(Boolean).join(' · ');
    $('modeObjective').textContent = (v.ph === 'break' ? (v.w ? 'Next wave soon — spend your gold' : 'The dead are stirring…') : `${v.left} monster${v.left === 1 ? '' : 's'} left`) + (boosts ? ' · ' + boosts : '');
  } else if (mode === 'royale' && S.zone) {
    const z = S.zone, left = clock(S.zoneEndsAt - performance.now()), final = z.stage >= z.stages - 1;
    $('modeRole').textContent = `${z.alive} ALIVE`;
    $('modeClock').textContent = z.shrinking ? left : '';
    $('modeObjective').textContent = z.shrinking ? 'STORM CLOSING IN' : final && !z.ms ? 'THE STORM HAS CLOSED' : 'STORM MOVES IN ' + left;
  }
}

function updateAmmoHud() {
  const el = $('ammoHud'), w = S.weapon;
  if (!el) return;
  if (S.dead || w === 'blade' || w === 'claws' || !WEAPONS[w]) { el.hidden = true; return; }
  el.hidden = false;
  const mag = S.mag[w] ?? 0, full = magSize(w, S.att), left = spare(w);
  $('ammoWeapon').textContent = gunName(w);
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
