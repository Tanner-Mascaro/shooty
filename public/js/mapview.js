// The in-match map screen: the whole level north-up with everyone on it, and the standings
// (kills or gun level, health, alive or down). Opened with the map button, the map key or from
// settings; M / Esc / ✕ / clicking outside closes it.
import { MW, MH } from '/shared/levels.js';
import { isTeamMode, teamName, PLAGUE_TEAM, MAX_HP, PLAGUE_MAX_HP } from '/shared/config.js';
import { S, nameOf, isEnemy } from './state.js';
import { mini } from './level.js';
import { scoreRows } from './ui.js';

const $ = id => document.getElementById(id);
let raf = 0;

export const mapOpen = () => !$('mapView').hidden;

export function openMap() {
  if (!S.started) return;
  if (document.pointerLockElement) document.exitPointerLock();
  $('settings').hidden = true;
  $('mapView').hidden = false;
  document.body.classList.add('map-open');
  if (!raf) raf = requestAnimationFrame(draw);
}

export function closeMap() {
  $('mapView').hidden = true;
  document.body.classList.remove('map-open');
  cancelAnimationFrame(raf); raf = 0;
}

export const toggleMap = () => (mapOpen() ? closeMap() : openMap());

// ---- the map ----
function draw() {
  raf = requestAnimationFrame(draw);
  if (!S.started) return closeMap();
  const c = $('mapCanvas'), box = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d'), k = Math.min(W / MW, H / MH), ox = (W - MW * k) / 2, oy = (H - MH * k) / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.drawImage(mini, ox, oy, MW * k, MH * k);
  g.setTransform(k, 0, 0, k, ox, oy); // world units from here on
  const px = 1 / k * dpr; // one CSS pixel in world units

  const z = S.zone;
  if (z) {
    g.beginPath(); g.rect(0, 0, MW, MH); g.arc(z.x, z.y, Math.max(0.01, z.r), 0, Math.PI * 2);
    g.fillStyle = 'rgba(110,30,150,0.4)'; g.fill('evenodd');
    g.strokeStyle = 'rgba(245,235,200,0.9)'; g.lineWidth = 2 * px; g.setLineDash([6 * px, 4 * px]);
    g.beginPath(); g.arc(z.nx, z.ny, Math.max(0.01, z.nr), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  const hill = S.hardpoint?.active;
  if (hill) {
    g.beginPath(); g.arc(hill.x, hill.y, hill.radius, 0, Math.PI * 2);
    g.fillStyle = 'rgba(245,225,150,0.2)'; g.fill();
    g.strokeStyle = 'rgba(245,225,150,0.95)'; g.lineWidth = 2 * px; g.stroke();
  }

  g.textAlign = 'center'; g.font = `700 ${12 * px}px 'Caslon Antique', Georgia, serif`;
  const label = (text, x, y, color) => {
    g.lineWidth = 3 * px; g.strokeStyle = 'rgba(20,10,4,0.85)'; g.strokeText(text, x, y - 9 * px);
    g.fillStyle = color; g.fillText(text, x, y - 9 * px);
  };
  for (const [id, o] of Object.entries(S.others)) {
    const p = o.now || o.cur;
    if (!p) continue;
    const color = isEnemy(+id) ? '#e0485a' : '#b890f0';
    if (p.dead) { // a cross where they fell
      g.strokeStyle = 'rgba(40,20,10,0.8)'; g.lineWidth = 2 * px;
      g.beginPath(); g.moveTo(p.x - 4 * px, p.y - 4 * px); g.lineTo(p.x + 4 * px, p.y + 4 * px);
      g.moveTo(p.x + 4 * px, p.y - 4 * px); g.lineTo(p.x - 4 * px, p.y + 4 * px); g.stroke();
      continue;
    }
    g.fillStyle = color; g.strokeStyle = '#1a0c06'; g.lineWidth = 1.5 * px;
    g.beginPath(); g.arc(p.x, p.y, 5 * px, 0, Math.PI * 2); g.fill(); g.stroke();
    label(nameOf(+id), p.x, p.y, color);
  }
  const me = S.me;
  if (me && !S.dead) { // you: a gold-rimmed arrow pointing where you face
    g.save(); g.translate(me.x, me.y); g.rotate(me.a);
    g.fillStyle = '#ff5a70'; g.strokeStyle = '#f0d890'; g.lineWidth = 1.5 * px;
    g.beginPath(); g.moveTo(9 * px, 0); g.lineTo(-6 * px, 6 * px); g.lineTo(-3 * px, 0); g.lineTo(-6 * px, -6 * px); g.closePath();
    g.fill(); g.stroke(); g.restore();
    label('You', me.x, me.y - 2 * px, '#ffd0d6');
  }
  drawStandings();
}

// ---- the standings ----
let lastKey = '';
function drawStandings() {
  const r = S.room;
  if (!r) return;
  const mode = r.mode, teams = isTeamMode(mode), gunGame = mode === 'gungame';
  const rows = scoreRows().map(row => {
    const mine = row.id === S.myId, st = mine ? { hp: S.me?.hp, dead: S.dead } : S.others[row.id]?.cur || {};
    const max = mode === 'plague' && row.team === PLAGUE_TEAM ? PLAGUE_MAX_HP : MAX_HP;
    return { ...row, hp: Math.round(100 * Math.max(0, st.hp ?? 0) / max), dead: !!st.dead };
  });
  const key = JSON.stringify([rows, mode, S.myTeam, r.players.map(p => p.name)]);
  if (key === lastKey) return;
  lastKey = key;
  $('mapHead').textContent = gunGame ? 'GUN' : 'KILLS';
  const line = row => {
    const tr = document.createElement('tr');
    if (row.id === S.myId) tr.className = 'you';
    if (row.dead) tr.classList.add('down');
    const name = document.createElement('td');
    name.textContent = nameOf(row.id);
    if (row.id !== S.myId && !(teams && mode !== 'plague')) name.classList.add(isEnemy(row.id) ? 'foe' : 'ally');
    const kills = document.createElement('td');
    kills.textContent = row.kills;
    const hp = document.createElement('td'), bar = document.createElement('span'), fill = document.createElement('i');
    bar.className = 'hpBar'; fill.style.width = Math.min(100, row.hp) + '%';
    bar.append(fill); hp.append(bar);
    const state = document.createElement('td');
    state.textContent = row.dead ? 'down' : mode === 'plague' && row.team === PLAGUE_TEAM ? 'infected' : 'alive';
    tr.append(name, kills, hp, state);
    return tr;
  };
  const out = [];
  if (teams) {
    for (const t of [1, 2]) {
      const members = rows.filter(row => row.team === t), head = document.createElement('tr'), th = document.createElement('th');
      head.className = 'teamHead team' + t; th.colSpan = 4;
      th.textContent = mode === 'hardpoint' ? `${teamName(mode, t)} · ${S.hardpoint?.scores?.[t] || 0}`
        : mode === 'plague' ? `${teamName(mode, t)} · ${members.length}`
        : `${teamName(mode, t)} · ${members.reduce((n, row) => n + row.kills, 0)}`;
      head.append(th);
      out.push(head, ...members.map(line));
    }
  } else out.push(...rows.map(line));
  $('mapStandings').tBodies[0].replaceChildren(...out);
}

export function initMap() {
  $('gameMap').addEventListener('click', openMap);
  $('settingsMap').addEventListener('click', openMap);
  $('mapClose').addEventListener('click', closeMap);
  // the top buttons stay usable over the map; settings takes over from it
  document.querySelectorAll('.gear').forEach(b => b.addEventListener('click', closeMap));
  $('mapView').addEventListener('click', e => { if (e.target.id === 'mapView') closeMap(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !mapOpen()) return;
    e.stopImmediatePropagation();
    closeMap();
  }, true);
}
