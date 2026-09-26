// Arena — Networked 3D Shooter
// Run: node server.js
// Then: npx ngrok http 3000  (or ngrok http 3000)
// Both players open the URL.

const http = require('http');
const WebSocket = require('ws');

const PORT = 3000;
const TICK = 1000 / 30;

// Maps are point-symmetric: only the top half is written out, the bottom half is the top rotated 180°.
// # = wall, L = lava/acid pit, . = ground, S/G/M = sniper/shotgun/SMG pickup pad
function mirror(half) { return half.concat(half.slice().reverse().map(r => r.split('').reverse().join(''))); }
const LEVELS = {
  hell: mirror([
    "############################",
    "#..........................#",
    "#.........................S#",
    "#...##........#.......##...#",
    "#...#.........#........#...#",
    "#..........LL.......#......#",
    "#..........LL.......#......#",
    "#..##............LL........#",
    "#..#.............LL...##...#",
    "#...M...#..................#",
    "#.......#.....###..........#",
    "#...LL.......#......#...L..#",
    "#...LL....##........#...L..#",
    "#............G.............#",
  ]),
  robot: mirror([
    "############################",
    "#.........................S#",
    "#..#....#....#....#....#...#",
    "#..........................#",
    "#..#..######...######..#...#",
    "#.....#..........LLL.#.....#",
    "#..#..#..........LLL.#.#...#",
    "#...M......##..............#",
    "#..#....#.....#....#...#...#",
    "#......###....#............#",
    "#..#..........#..###...#...#",
    "#......LL..........#.......#",
    "#..#...LL....##....#...#...#",
    "#............G.............#",
  ]),
};
const LEVEL_NAMES = { hell: 'HELL', robot: 'ROBOT FACTORY' };
const RES = 8; // heightmap samples per map unit
const MW = LEVELS.hell[0].length, MH = LEVELS.hell.length;
for (const k in LEVELS) if (LEVELS[k].length !== MH || LEVELS[k].some(r => r.length !== MW)) throw new Error('Level ' + k + ' must be ' + MW + 'x' + MH);
const MAX_HP = 100, WIN_SCORE = 10, MAX_DEPTH = 40, PIT_DPS = 40, PICKUP_RESPAWN = 15000;
const EYE = 0.62, BODY_H = 0.8; // eye height and hitbox height above a player's feet
const WEAPONS = {
  rifle:   { dmg: 20,  head: 2,   cd: 120,  spread: 0.015, scopedSpread: 0.015, airSpread: 0.05, auto: true },
  sniper:  { dmg: 100, head: 1.5, cd: 1400, spread: 0.12,  scopedSpread: 0,     airSpread: 0.08 },
  shotgun: { dmg: 12,  head: 1.5, cd: 850,  spread: 0.07,  pellets: 8, falloff: 12 },
  smg:     { dmg: 11,  head: 1.8, cd: 75,   spread: 0.03,  scopedSpread: 0.03,  airSpread: 0.07, auto: true },
  blade:   { dmg: 55,  backstab: 150, cd: 450, range: 1.4, melee: true },
};
const AMMO = { sniper: 8, shotgun: 12, smg: 90 }; // pickup weapons; rifle and blade are unlimited

// --- Terrain (shared: these functions are also sent to the client) ---
function buildTerrain(MAP, RES) {
  const MW = MAP[0].length, MH = MAP.length, TW = MW * RES, TH = MH * RES;
  const hgt = new Float32Array(TW * TH), kind = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const cx = Math.floor(i / RES), cy = Math.floor(j / RES), c = MAP[cy][cx], k = j * TW + i;
    if (c === '#') {
      const edge = cx === 0 || cy === 0 || cx === MW - 1 || cy === MH - 1;
      hgt[k] = edge ? 2.8 : 1.6; kind[k] = 1;
    } else if (c === 'L') { hgt[k] = -0.35; kind[k] = 2; }
  }
  return { hgt, kind, TW, TH, RES };
}

function groundAt(T, x, y) {
  const fx = x * T.RES - 0.5, fy = y * T.RES - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const g = (a, b) => {
    a = a < 0 ? 0 : a >= T.TW ? T.TW - 1 : a;
    b = b < 0 ? 0 : b >= T.TH ? T.TH - 1 : b;
    return T.hgt[b * T.TW + a];
  };
  return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
}

function kindAt(T, x, y) {
  const i = Math.floor(x * T.RES), j = Math.floor(y * T.RES);
  if (i < 0 || j < 0 || i >= T.TW || j >= T.TH) return 1;
  return T.kind[j * T.TW + i];
}

function findPickups(MAP) {
  const kinds = { S: 'sniper', G: 'shotgun', M: 'smg' }, out = [];
  for (let y = 0; y < MAP.length; y++)
    for (let x = 0; x < MAP[y].length; x++)
      if (kinds[MAP[y][x]]) out.push({ x: x + 0.5, y: y + 0.5, weapon: kinds[MAP[y][x]] });
  return out;
}

const TERRAINS = {};
for (const k in LEVELS) TERRAINS[k] = buildTerrain(LEVELS[k], RES);
let level = 'hell', MAP = LEVELS[level], T = TERRAINS[level];
let pickups = [];
function resetPickups() { pickups = findPickups(MAP).map(p => Object.assign(p, { active: true, respawnAt: 0 })); }
resetPickups();

function spawnPos(avoid) {
  const spots = [];
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      if (MAP[y][x] !== '.') continue;
      let nearPit = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (MAP[y + dy][x + dx] === 'L') nearPit = true;
      if (!nearPit) spots.push({ x: x + 0.5, y: y + 0.5 });
    }
  if (avoid) {
    spots.sort((a, b) => {
      const da = Math.hypot(a.x - avoid.x, a.y - avoid.y);
      const db = Math.hypot(b.x - avoid.x, b.y - avoid.y);
      return db - da;
    });
    return spots[Math.floor(Math.random() * Math.min(10, spots.length))];
  }
  return spots[Math.floor(Math.random() * spots.length)];
}

// --- Game State ---
let players = {};
let clients = [];
let nextId = 0;
let gameOn = false;

function opponent(p) { return Object.values(players).find(o => o.id !== p.id) || null; }

function sendInv(p) {
  const c = clients.find(c => c.id === p.id);
  if (c) sendTo(c, { type: 'inv', inv: p.inv });
}

function resetPlayer(p, avoid) {
  const sp = spawnPos(avoid);
  p.x = sp.x; p.y = sp.y; p.z = groundAt(T, sp.x, sp.y);
  p.a = avoid ? Math.atan2(avoid.y - sp.y, avoid.x - sp.x) : Math.random() * Math.PI * 2;
  p.p = 0;
  p.hp = MAX_HP;
  p.inv = {}; // picked-up guns are lost on death
  p.seq++;    // client snaps to the new spawn; stale inputs from the old life are ignored
  sendInv(p);
}

const rnd = () => Math.random() * 2 - 1;

// march one bullet ray; returns where it stopped and whether it hit the other player
function castShot(shooter, a, pch, other) {
  const r = { a, p: pch, dist: MAX_DEPTH, hit: false, head: false };
  const eye = shooter.z + EYE, cos = Math.cos(a), sin = Math.sin(a), step = 0.04;
  for (let d = step; d < MAX_DEPTH; d += step) {
    const rx = shooter.x + cos * d, ry = shooter.y + sin * d, rz = eye + pch * d;
    if (rz < groundAt(T, rx, ry)) { r.dist = d; return r; }
    if (other && Math.hypot(rx - other.x, ry - other.y) < 0.32 && rz >= other.z && rz <= other.z + BODY_H + 0.05) {
      r.dist = d; r.hit = true;
      r.head = rz >= other.z + BODY_H - 0.2;
      return r;
    }
  }
  return r;
}

function doShoot(shooter, weapon, scoped) {
  const w = WEAPONS[weapon], other = opponent(shooter);
  const airborne = shooter.z - groundAt(T, shooter.x, shooter.y) > 0.05;
  const spread = w.pellets ? w.spread : airborne ? w.airSpread : scoped ? w.scopedSpread : w.spread;
  const res = { rays: [], dmg: 0, head: false, backstab: false, hitRay: null };
  for (let i = 0; i < (w.pellets || 1); i++) {
    const r = castShot(shooter, shooter.a + rnd() * spread, shooter.p + rnd() * spread, other);
    res.rays.push(r);
    if (!r.hit) continue;
    let d = w.dmg * (r.head ? w.head : 1);
    if (w.falloff) d *= Math.max(0.3, 1 - r.dist / w.falloff);
    res.dmg += d;
    res.head = res.head || r.head;
    res.hitRay = res.hitRay || r;
  }
  res.dmg = Math.round(res.dmg);
  return res;
}

function doMelee(p) {
  const w = WEAPONS.blade, other = opponent(p);
  const ray = { a: p.a, p: p.p, dist: w.range, hit: false, head: false };
  const res = { rays: [ray], dmg: 0, head: false, backstab: false, hitRay: null };
  if (!other) return res;
  const dx = other.x - p.x, dy = other.y - p.y, d = Math.hypot(dx, dy);
  if (d > w.range) return res;
  let da = Math.atan2(dy, dx) - p.a;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  if (Math.abs(da) > 0.8) return res;
  if (Math.abs(p.z + EYE - (other.z + BODY_H / 2)) > 1.0) return res;
  for (let t = 0.1; t < 1; t += 0.1) // blade can't go through walls
    if (groundAt(T, p.x + dx * t, p.y + dy * t) > p.z + EYE * 0.5 + (other.z - p.z) * t) return res;
  res.backstab = (Math.cos(other.a) * dx + Math.sin(other.a) * dy) / (d || 1) > 0.5;
  ray.hit = true; ray.dist = d; ray.a = Math.atan2(dy, dx);
  res.hitRay = ray;
  res.dmg = res.backstab ? w.backstab : w.dmg;
  return res;
}

function killPlayer(victim, killer, info) {
  const at = { x: victim.x, y: victim.y, z: victim.z };
  if (killer) killer.kills++;
  resetPlayer(victim, killer || opponent(victim));
  broadcast(Object.assign({ type: 'kill', killer: killer ? killer.id : null, victim: victim.id }, info, at));
  if (killer && killer.kills >= WIN_SCORE) {
    gameOn = false;
    Object.values(players).forEach(pl => pl.ready = false);
    broadcast({ type: 'win', winner: killer.id });
  }
}

function broadcastPickups() { broadcast({ type: 'pickups', active: pickups.map(p => p.active) }); }

function startGame() {
  const ps = Object.values(players);
  ps.forEach(pl => { pl.kills = 0; pl.ready = false; });
  resetPickups();
  resetPlayer(ps[0], null);
  resetPlayer(ps[1], ps[0]);
  gameOn = true;
  broadcast({ type: 'start', level });
  broadcastPickups();
  console.log('Game started on ' + level + '!');
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(c => { try { c.socket.send(data); } catch(e) {} });
}

function sendTo(client, msg) {
  try { client.socket.send(JSON.stringify(msg)); } catch(e) {}
}

// --- HTML ---
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Arena</title>
<style>
:root { box-sizing: border-box; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#000; overflow:hidden; height:100vh; font-family:'Courier New',monospace; }
canvas { display:block; position:absolute; top:0; left:0; }
#hud { position:absolute; top:10px; left:50%; transform:translateX(-50%); display:flex; gap:30px; z-index:10; pointer-events:none; }
.ph { color:#fff; font-size:13px; text-align:center; text-shadow:0 0 4px #000; }
.hp-bar { width:140px; height:8px; background:#111; border:1px solid #444; margin-top:2px; }
.hp-fill { height:100%; transition:width .15s; }
#msg { position:absolute; top:40%; left:50%; transform:translate(-50%,-50%); color:#fc3; font-size:32px; font-weight:bold; text-shadow:0 0 12px #000; z-index:20; pointer-events:none; opacity:0; transition:opacity .3s; white-space:nowrap; }
#wait { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#bbb; font-size:20px; z-index:100; gap:16px; }
#waitTitle { font-size:40px; font-weight:bold; letter-spacing:6px; }
#levels { display:flex; gap:12px; }
#levels button, #readyBtn { font-family:'Courier New',monospace; font-size:16px; padding:10px 20px; border:2px solid #555; border-radius:4px; cursor:pointer; font-weight:bold; background:#111; color:#aaa; }
#levels button.sel { color:#000; }
#levels button[data-level=hell].sel { background:#e33; border-color:#f66; }
#levels button[data-level=robot].sel { background:#3ce; border-color:#8ef; }
#readyBtn { font-size:18px; padding:12px 28px; background:#ddd; color:#000; border-color:#fff; }
#readyBtn:disabled { background:#333; color:#777; border-color:#444; cursor:default; }
#controls { position:absolute; bottom:8px; left:50%; transform:translateX(-50%); color:#666; font-size:11px; z-index:10; pointer-events:none; white-space:nowrap; }
</style>
</head>
<body>
<div id="wait">
  <div id="waitTitle">ARENA</div>
  <div id="levels"><button data-level="hell">HELL</button><button data-level="robot">ROBOT FACTORY</button></div>
  <div id="waitMsg">Connecting...</div>
  <button id="readyBtn" disabled>I'm Here</button>
</div>
<div id="hud">
  <div class="ph"><span style="color:#fa4;font-weight:bold">YOU</span> <span id="sk">0</span>
    <div class="hp-bar"><div class="hp-fill" id="myhp" style="width:100%;background:#fa4"></div></div>
  </div>
  <div class="ph"><span style="color:#f33;font-weight:bold">ENEMY</span> <span id="ek">0</span>
    <div class="hp-bar"><div class="hp-fill" id="ehp" style="width:100%;background:#f33"></div></div>
  </div>
</div>
<canvas id="c"></canvas>
<div id="msg"></div>
<div id="controls">WASD move | mouse aim | space jump (hold to bhop) | click shoot | right click scope | 1-5/Q/wheel weapon | F melee | walk over glowing pads to grab guns</div>
<script>
const LEVELS = ${JSON.stringify(LEVELS)};
const RES = ${RES}, MW = ${MW}, MH = ${MH}, MAX_DEPTH = ${MAX_DEPTH};
const EYE = ${EYE}, BODY_H = ${BODY_H};
const WEAPONS = ${JSON.stringify(WEAPONS)};
const AMMO = ${JSON.stringify(AMMO)};
${buildTerrain.toString()}
${groundAt.toString()}
${kindAt.toString()}
${findPickups.toString()}

const BASE_FOV = Math.PI/3, SCOPE_FOV = Math.PI/14;
// Quake-style movement, scaled so 320 qu/s = 3 map units/s
const MAX_SPEED = 3.0, ACCEL = 10, AIR_ACCEL = 12, AIR_CAP = 0.28, FRICTION = 5, STOP_SPEED = 1.0;
const GRAVITY = 7.5, JUMP_V = 2.55, SPEED_LIMIT = 10, STEP = 0.3, SENS = 0.0025;
const WEAPON_ORDER = ['rifle', 'sniper', 'shotgun', 'smg', 'blade'];
const GUN_COLOR = { sniper: [255, 80, 60], shotgun: [255, 200, 60], smg: [80, 220, 255] };

const THEMES = {
  hell: {
    id: 'hell', name: 'HELL', fog: [60, 10, 6], fogK: 0.06, skyLo: [170, 42, 12], skyHi: [18, 2, 6],
    orb: [215, 55, 25], orbGlow: [90, 12, 4], orbA: 0.9, orbE: 0.3, orbR: 0.08,
    wall: [48, 22, 28], wallTop: [60, 22, 26], band: [230, 40, 10],
    ambient: [255, 120, 20], ambientVz: 0.5, blood: [150, 5, 5], fire: [255, 110, 10],
    sprite: 'demon', pitDeath: 'Burned alive!', enemyPitDeath: 'Enemy burned!', pitOverlay: '255,70,0',
    accent: '255,70,20', bg: '#3a0600', title: '#f42', drone: [['sawtooth', 41], ['sawtooth', 43.7], ['sawtooth', 82.1]], droneCut: 160,
  },
  robot: {
    id: 'robot', name: 'ROBOT FACTORY', fog: [14, 20, 30], fogK: 0.05, skyLo: [50, 70, 95], skyHi: [4, 6, 12],
    orb: [150, 170, 200], orbGlow: [25, 40, 70], orbA: -2.2, orbE: 0.35, orbR: 0.14,
    wall: [70, 76, 88], wallTop: [95, 100, 112], band: [40, 220, 255],
    ambient: [80, 220, 255], ambientVz: 0.15, blood: [35, 35, 40], fire: [140, 230, 255],
    sprite: 'robot', pitDeath: 'Dissolved!', enemyPitDeath: 'Enemy dissolved!', pitOverlay: '40,255,150',
    accent: '40,220,255', bg: '#06202a', title: '#3ce', drone: [['square', 55], ['square', 110.4], ['sine', 220]], droneCut: 400,
  },
};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const off = document.createElement('canvas'), octx = off.getContext('2d');
let W, H, RW, RH, img, pix, zbuf, skyRow;
function resize() {
  W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight;
  RW = Math.min(480, Math.round(W / 2)); RH = Math.max(1, Math.round(RW * H / W));
  off.width = RW; off.height = RH;
  img = octx.createImageData(RW, RH);
  pix = new Uint32Array(img.data.buffer);
  zbuf = new Float32Array(RW * RH);
  skyRow = new Uint32Array(RH);
}
resize(); window.addEventListener('resize', resize);

function pk(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// --- Level: terrain, precomputed colors, minimap ---
let level = null, MAP = null, T = null, theme = THEMES.hell;
let CR, CG, CB, EM, pickupSpots = [], pickupActive = [];
const mini = document.createElement('canvas');

function buildColors() {
  const NT = T.TW * T.TH;
  CR = new Uint8Array(NT); CG = new Uint8Array(NT); CB = new Uint8Array(NT); EM = new Uint8Array(NT);
  const pits = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (MAP[y][x] === 'L') pits.push([x + 0.5, y + 0.5]);
  const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const robot = theme.id === 'robot';
  for (let j = 0; j < T.TH; j++) for (let i = 0; i < T.TW; i++) {
    const k = j * T.TW + i, x = (i + 0.5) / RES, y = (j + 0.5) / RES, n = hash(i, j), kd = T.kind[k];
    let r, g, b;
    if (kd === 0) {
      let ld = 99;
      for (const L of pits) ld = Math.min(ld, Math.max(0, Math.max(Math.abs(x - L[0]), Math.abs(y - L[1])) - 0.5));
      const glow = Math.max(0, 1 - ld / 1.5) ** 2;
      if (!robot) {
        const v = 0.75 + n * 0.5;
        r = 60 * v + 130 * glow; g = 24 * v + 35 * glow; b = 20 * v;
        const c = Math.abs(Math.sin(x * 1.9 + Math.sin(y * 1.3) * 2.2) + Math.sin(y * 2.1 + Math.sin(x * 1.1) * 2.0));
        if (c < 0.022) { r = 255; g = 70 + n * 50; b = 15; EM[k] = 1; }
      } else {
        // metal floor plates with seams, rivets, hazard stripes by the acid and floor lights
        const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy;
        const v = (0.9 + n * 0.15) * (((cx + cy) & 1) ? 1 : 0.88);
        r = 52 * v; g = 58 * v; b = 66 * v;
        if (fx < 0.07 || fy < 0.07) { r = 28; g = 31; b = 36; }
        if ((Math.abs(fx - 0.15) < 0.04 || Math.abs(fx - 0.85) < 0.04) && (Math.abs(fy - 0.15) < 0.04 || Math.abs(fy - 0.85) < 0.04)) { r = 95; g = 100; b = 110; }
        if (ld < 0.5) { const s = ((x + y) * 2.5) % 1 < 0.5; r = s ? 200 : 25; g = s ? 165 : 25; b = s ? 20 : 25; }
        r += 10 * glow; g += 60 * glow; b += 40 * glow;
        if (cx % 4 === 2 && cy % 4 === 2 && Math.hypot(fx - 0.5, fy - 0.5) < 0.12) { r = 60; g = 220; b = 255; EM[k] = 1; }
      }
    } else if (kd === 1) { const v = 0.85 + n * 0.3; r = theme.wallTop[0] * v; g = theme.wallTop[1] * v; b = theme.wallTop[2] * v; }
    else { r = 255; g = 90; b = 10; EM[k] = 2; }
    CR[k] = Math.min(255, r); CG[k] = Math.min(255, g); CB[k] = Math.min(255, b);
  }
}

function buildMini() {
  mini.width = T.TW; mini.height = T.TH;
  const mc = mini.getContext('2d'), id = mc.createImageData(T.TW, T.TH), p32 = new Uint32Array(id.data.buffer);
  const robot = theme.id === 'robot';
  for (let k = 0; k < T.TW * T.TH; k++) {
    const kd = T.kind[k];
    p32[k] = kd === 1 ? (robot ? pk(110, 120, 135) : pk(110, 40, 40)) : kd === 2 ? (robot ? pk(40, 255, 150) : pk(255, 110, 20)) : (robot ? pk(30, 36, 44) : pk(40, 16, 14));
  }
  mc.putImageData(id, 0, 0);
}

function setLevel(name) {
  if (!LEVELS[name] || name === level) return;
  level = name; MAP = LEVELS[name]; theme = THEMES[name];
  T = buildTerrain(MAP, RES);
  buildColors(); buildMini();
  pickupSpots = findPickups(MAP);
  pickupActive = pickupSpots.map(() => true);
  embers = []; particles = []; corpses = []; tracers = [];
  document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('sel', b.dataset.level === name));
  const title = document.getElementById('waitTitle');
  title.textContent = theme.name;
  title.style.color = theme.title; title.style.textShadow = '0 0 18px ' + theme.title;
  document.getElementById('wait').style.background = 'radial-gradient(circle at 50% 60%, ' + theme.bg + ', #000 70%)';
  updateDrone();
}

// ray-march depths along each column, shared by every frame
const ZS = [];
for (let z = 0.05; z < MAX_DEPTH; z += 0.004 + z * 0.01) ZS.push(z);

// --- Audio (all sounds synthesized with WebAudio) ---
let actx = null, master = null, verb = null, noiseBuf = null, windGain = null, sizzleGain = null, droneOsc = [], droneLp = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain(); master.gain.value = 0.6; master.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // cavernous reverb for gunshots
  const len = actx.sampleRate * 2.5, ir = actx.createBuffer(2, len, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const dd = ir.getChannelData(ch); for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  verb = actx.createConvolver(); verb.buffer = ir; verb.connect(master);
  const loop = (filter, freq) => {
    const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = actx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = 0.7;
    const g = actx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    return g;
  };
  windGain = loop('bandpass', 500);    // swells with bhop speed
  sizzleGain = loop('highpass', 2500); // standing in a pit
  // ambient level drone
  droneLp = actx.createBiquadFilter(); droneLp.type = 'lowpass';
  const dg = actx.createGain(); dg.gain.value = 0.05; droneLp.connect(dg); dg.connect(master);
  droneOsc = [0, 1, 2].map(() => { const o = actx.createOscillator(); o.connect(droneLp); o.start(); return o; });
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = actx.createGain(); lg.gain.value = 80; lfo.connect(lg); lg.connect(droneLp.frequency); lfo.start();
  updateDrone();
}
function updateDrone() {
  if (!actx) return;
  droneOsc.forEach((o, i) => { o.type = theme.drone[i][0]; o.frequency.value = theme.drone[i][1]; });
  droneLp.frequency.value = theme.droneCut;
}
function bus(vol, pan, wet) {
  const g = actx.createGain(); g.gain.value = vol;
  let o = g;
  if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; g.connect(p); o = p; }
  o.connect(master);
  if (wet) { const s = actx.createGain(); s.gain.value = wet; o.connect(s); s.connect(verb); }
  return g;
}
function noise(out, o) {
  const t = actx.currentTime + (o.delay || 0);
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(o.freq || 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol || 1, t + (o.attack || 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.8); s.stop(t + o.dur + 0.02);
}
function tone(out, o) {
  const t = actx.currentTime + (o.delay || 0);
  const s = actx.createOscillator(); s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.freq, t);
  if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(g); g.connect(out);
  s.start(t); s.stop(t + o.dur + 0.02);
}
const SFX = {
  rifle(v, p) { const o = bus(v, p, 0.15); noise(o, { filter:'bandpass', freq:1800, q:0.8, dur:0.12, vol:0.9 }); noise(o, { freq:500, dur:0.18, vol:0.8 }); tone(o, { type:'square', freq:160, to:50, dur:0.08, vol:0.25 }); },
  smg(v, p) { const o = bus(v * 0.8, p, 0.1); noise(o, { filter:'bandpass', freq:2600, q:0.9, dur:0.07, vol:0.8 }); noise(o, { freq:800, dur:0.1, vol:0.6 }); tone(o, { type:'square', freq:220, to:90, dur:0.05, vol:0.18 }); },
  shotgun(v, p) {
    const o = bus(v, p, 0.4);
    noise(o, { freq:1400, to:300, dur:0.4, vol:1.3 }); tone(o, { freq:95, to:32, dur:0.45, vol:1.1 }); noise(o, { filter:'bandpass', freq:700, q:1, dur:0.2, vol:0.7 });
  },
  pump(v, p) { const o = bus(0.6 * (v || 1), p); noise(o, { filter:'bandpass', freq:1200, q:2, dur:0.07, vol:0.8 }); noise(o, { filter:'bandpass', freq:1800, q:2, dur:0.07, vol:0.8, delay:0.16 }); },
  sniper(v, p) {
    const o = bus(v, p, 0.6);
    noise(o, { filter:'highpass', freq:3500, dur:0.04, vol:1 });     // crack
    noise(o, { freq:2500, to:400, dur:0.4, vol:1.2 });                 // blast
    tone(o, { freq:75, to:26, dur:1.0, vol:1.3 });                     // sub boom
    noise(o, { filter:'bandpass', freq:900, q:2, dur:0.12, vol:0.5 }); // body
    noise(o, { freq:600, dur:1.1, vol:0.35, delay:0.18, attack:0.08 }); // rolling echo
  },
  bolt() { const o = bus(0.6, 0); noise(o, { filter:'bandpass', freq:2500, q:3, dur:0.05, vol:0.8 }); tone(o, { type:'square', freq:300, to:200, dur:0.03, vol:0.1 }); noise(o, { filter:'bandpass', freq:1700, q:3, dur:0.06, vol:0.8, delay:0.2 }); },
  dry() { const o = bus(0.4, 0); noise(o, { filter:'bandpass', freq:3000, q:4, dur:0.03, vol:0.7 }); },
  pickup(v, p) { const o = bus(v * 0.6, p, 0.2); noise(o, { filter:'bandpass', freq:1500, q:2, dur:0.06, vol:0.8 }); tone(o, { type:'triangle', freq:660, dur:0.12, vol:0.3, delay:0.05 }); tone(o, { type:'triangle', freq:990, dur:0.2, vol:0.3, delay:0.13 }); },
  scope(on) { const o = bus(0.5, 0); noise(o, { filter:'bandpass', freq:on ? 3500 : 2200, q:4, dur:0.05, vol:0.6 }); },
  swap() { const o = bus(0.5, 0); noise(o, { filter:'bandpass', freq:1500, q:3, dur:0.04, vol:0.6 }); noise(o, { filter:'bandpass', freq:2800, q:3, dur:0.04, vol:0.5, delay:0.12 }); },
  swing(v, p) { const o = bus(v * 0.7, p); noise(o, { filter:'bandpass', freq:400, to:2500, q:1.5, dur:0.2, vol:0.9, attack:0.05 }); },
  slash(v, p) { const o = bus(v, p, 0.2); noise(o, { filter:'highpass', freq:3000, dur:0.1, vol:0.8 }); tone(o, { freq:150, to:60, dur:0.14, vol:0.6 }); noise(o, { freq:600, dur:0.15, vol:0.7 }); },
  backstab() { const o = bus(1, 0, 0.4); noise(o, { filter:'highpass', freq:2500, dur:0.15, vol:1 }); tone(o, { type:'sawtooth', freq:110, to:35, dur:0.6, vol:0.4 }); },
  whiz(v, p) { const o = bus(v, p); noise(o, { filter:'bandpass', freq:5000, to:1500, q:2, dur:0.12, vol:1 }); },
  jump(v, p) { const o = bus(v * 0.5, p); noise(o, { freq:900, dur:0.12, vol:0.4, attack:0.02 }); },
  land(v, p) { const o = bus(v, p); noise(o, { freq:350, dur:0.12, vol:0.6 }); tone(o, { freq:90, to:45, dur:0.1, vol:0.3 }); },
  step(v, p) { const o = bus(v * 0.35, p); noise(o, { freq:500 + Math.random() * 300, dur:0.07, vol:0.6 }); },
  hitmarker() { const o = bus(0.4, 0); tone(o, { type:'square', freq:1400, dur:0.05, vol:0.2 }); tone(o, { type:'square', freq:2100, dur:0.04, vol:0.15, delay:0.02 }); },
  headshot() { const o = bus(0.6, 0, 0.3); tone(o, { freq:2600, dur:0.4, vol:0.3 }); tone(o, { freq:3900, dur:0.3, vol:0.15 }); noise(o, { freq:1200, dur:0.08, vol:0.8 }); },
  hurt() { const o = bus(0.6, 0); tone(o, { type:'sawtooth', freq:220, to:90, dur:0.2, vol:0.25 }); noise(o, { freq:400, dur:0.15, vol:0.5 }); },
  kill() { const o = bus(0.5, 0, 0.2); tone(o, { freq:60, to:40, dur:0.3, vol:0.8 }); tone(o, { type:'triangle', freq:880, dur:0.12, vol:0.35 }); tone(o, { type:'triangle', freq:1320, dur:0.3, vol:0.35, delay:0.09 }); },
  death() { const o = bus(0.6, 0, 0.3); tone(o, { type:'sawtooth', freq:300, to:50, dur:0.7, vol:0.3 }); },
  burn(v, p) { const o = bus(0.7 * v, p, 0.3); noise(o, { filter:'highpass', freq:1500, dur:1.2, vol:0.9, attack:0.05 }); tone(o, { type:'sawtooth', freq:200, to:40, dur:1, vol:0.3 }); },
  thud(v, p) { const o = bus(v, p); tone(o, { freq:70, to:35, dur:0.25, vol:0.8 }); noise(o, { freq:300, dur:0.2, vol:0.6 }); },
  win() { const o = bus(0.5, 0, 0.3); [523, 659, 784, 1047].forEach((f, i) => tone(o, { type:'triangle', freq:f, dur:0.3, vol:0.3, delay:i * 0.12 })); },
  lose() { const o = bus(0.5, 0, 0.3); [392, 330, 262, 196].forEach((f, i) => tone(o, { type:'triangle', freq:f, dur:0.35, vol:0.3, delay:i * 0.15 })); },
};
function play(name, vol, pan) { if (!actx) return; try { SFX[name](vol === undefined ? 1 : vol, pan || 0); } catch(e) {} }
function spatial(x, y) {
  if (!me) return { vol:1, pan:0 };
  const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
  return { vol: 1 / (1 + d * 0.3), pan: Math.max(-1, Math.min(1, Math.sin(Math.atan2(dy, dx) - me.a))) };
}
function playAt(name, x, y, boost) { const s = spatial(x, y); play(name, s.vol * (boost || 1), s.pan); }
function setLoop(g, v) { if (g) g.gain.setTargetAtTime(v, actx.currentTime, 0.1); }

// --- Networking ---
const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
let myId = null, started = false, lockBound = false;
let me = null, mySeq = 0, pitch = 0, inv = {};
let myKills = 0;
// enemy is interpolated between the last two server states
let ePrev = null, eCur = null, eTime = 0, enemy = null;

const readyBtn = document.getElementById('readyBtn');
const waitMsg = document.getElementById('waitMsg');
readyBtn.addEventListener('click', () => {
  initAudio();
  ws.send(JSON.stringify({ type:'ready' }));
  readyBtn.disabled = true;
  readyBtn.textContent = 'Ready!';
  waitMsg.textContent = 'Waiting for other player...';
});
document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => {
  initAudio();
  ws.send(JSON.stringify({ type:'level', level: b.dataset.level }));
}));

ws.onopen = () => { waitMsg.textContent = 'Waiting for opponent...'; };
ws.onclose = () => { waitMsg.textContent = 'Disconnected — refresh to reconnect.'; readyBtn.disabled = true; };
ws.onerror = () => { waitMsg.textContent = 'Connection failed — refresh to retry.'; readyBtn.disabled = true; };

function showWait(text, btn) {
  document.getElementById('wait').style.display = 'flex';
  waitMsg.textContent = text;
  readyBtn.disabled = false;
  readyBtn.textContent = btn;
  if (document.pointerLockElement) document.exitPointerLock();
}

const airborne = p => p.z - groundAt(T, p.x, p.y) > 0.05;
let enemyStep = 0;
function enemySounds(prev, cur) {
  if (prev.seq !== cur.seq) return;
  if (!airborne(prev) && airborne(cur)) playAt('jump', cur.x, cur.y);
  if (airborne(prev) && !airborne(cur)) playAt('land', cur.x, cur.y);
  if (!airborne(cur)) {
    enemyStep += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (enemyStep > 0.85) { enemyStep = 0; playAt('step', cur.x, cur.y); }
  }
}

const owned = w => w === 'rifle' || w === 'blade' || inv[w] > 0;

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  const now = performance.now();
  if (msg.type === 'init') {
    myId = msg.id;
    setLevel(msg.level);
    me = { x: msg.x, y: msg.y, z: msg.z, a: msg.a, hp: msg.hp };
    mySeq = msg.seq;
    readyBtn.disabled = false;
  }
  if (msg.type === 'level') {
    setLevel(msg.level);
    readyBtn.disabled = false; readyBtn.textContent = "I'm Here";
  }
  if (msg.type === 'waiting') {
    waitMsg.textContent = msg.reason;
  }
  if (msg.type === 'start') {
    setLevel(msg.level);
    started = true;
    myKills = 0;
    weapon = 'rifle'; scoped = false;
    document.getElementById('wait').style.display = 'none';
    document.getElementById('msg').style.opacity = 0;
    if (!lockBound) { lockBound = true; canvas.addEventListener('click', () => { initAudio(); canvas.requestPointerLock(); }); }
  }
  if (msg.type === 'inv') {
    inv = msg.inv;
    if (!owned(weapon)) { weapon = 'rifle'; scoped = false; }
  }
  if (msg.type === 'pickups') pickupActive = msg.active;
  if (msg.type === 'pickup') {
    const sp = pickupSpots[msg.idx];
    burst(sp.x, sp.y, 0.3, 20, 'spark');
    if (msg.id === myId) { play('pickup'); banner('+ ' + msg.weapon.toUpperCase(), true); switchWeapon(msg.weapon); }
    else playAt('pickup', sp.x, sp.y);
  }
  if (msg.type === 'state') {
    const ep = msg.players.find(p => p.id !== myId);
    const mp = msg.players.find(p => p.id === myId);
    if (ep) {
      if (eCur) enemySounds(eCur, ep);
      ePrev = eCur && eCur.seq === ep.seq ? eCur : ep;
      eCur = ep; eTime = now;
    }
    if (mp) {
      me.hp = mp.hp; myKills = mp.kills;
      // our own position is client-authoritative; only snap to the server on respawn
      if (mp.seq !== mySeq) {
        mySeq = mp.seq;
        me.x = mp.x; me.y = mp.y; me.z = mp.z; me.a = mp.a; pitch = 0;
        vx = vy = vz = 0; onGround = true; scoped = false;
      }
    }
  }
  if (msg.type === 'shot') {
    if (msg.weapon === 'blade') { if (msg.id !== myId) playAt('swing', msg.x, msg.y); }
    else {
      if (msg.id !== myId) {
        enemyFlashT = now;
        playAt(msg.weapon, msg.x, msg.y, msg.weapon === 'sniper' ? 2 : 1);
        if (msg.weapon === 'shotgun') setTimeout(() => playAt('pump', msg.x, msg.y), 350);
      }
      let whizzed = false;
      for (const r of msg.rays) {
        const ex = msg.x + Math.cos(r.a) * r.dist, ey = msg.y + Math.sin(r.a) * r.dist, ez = msg.z + EYE + r.p * r.dist;
        tracers.push({ x0:msg.x, y0:msg.y, z0:msg.z + EYE - 0.12, x1:ex, y1:ey, z1:ez, weapon:msg.weapon, t:now, mine: msg.id === myId });
        if (!r.hit) burst(ex, ey, ez, msg.weapon === 'sniper' ? 28 : msg.weapon === 'shotgun' ? 3 : 8, 'spark');
        if (msg.id !== myId && !r.hit && !whizzed) {
          // bullet passing close by cracks past your head
          const dx = ex - msg.x, dy = ey - msg.y, L2 = dx*dx + dy*dy || 1;
          const t = Math.max(0, Math.min(1, ((me.x - msg.x) * dx + (me.y - msg.y) * dy) / L2));
          const cx = msg.x + dx * t, cy = msg.y + dy * t, miss = Math.hypot(me.x - cx, me.y - cy);
          if (miss < 1.5) { const s = spatial(cx, cy); play('whiz', 1 - miss / 2, s.pan); whizzed = true; }
        }
      }
    }
  }
  if (msg.type === 'hit') {
    burst(msg.x, msg.y, msg.z, msg.weapon === 'sniper' ? 40 : msg.weapon === 'shotgun' ? 30 : msg.head ? 20 : 12, 'blood');
    if (msg.weapon === 'blade') playAt('slash', msg.x, msg.y);
    if (msg.who === myId) { hitFlash = 8; play('hurt'); shake = Math.max(shake, 6); }
    else enemyHitT = now;
    if (msg.by === myId) {
      hitMarker = 14; hitHead = msg.head;
      play(msg.head ? 'headshot' : 'hitmarker');
    }
  }
  if (msg.type === 'kill') {
    const pit = msg.weapon === 'pit';
    const fling = { sniper: 6, shotgun: 5, blade: 3, pit: 0 }[msg.weapon];
    const a = msg.a || 0, fl = fling === undefined ? 2 : fling;
    corpses.push({ x:msg.x, y:msg.y, z:msg.z, vx:Math.cos(a) * fl, vy:Math.sin(a) * fl, vz:fl * 0.5 + 1, t:now, landed:false, mine: msg.victim === myId });
    burst(msg.x, msg.y, msg.z + 0.4, 45, pit ? 'fire' : 'blood');
    burst(msg.x, msg.y, msg.z + 0.4, 25, 'fire');
    if (msg.killer === myId) {
      const label = msg.backstab ? 'BACKSTAB' : msg.head ? 'HEADSHOT' : 'KILL';
      banner(label + (msg.weapon === 'sniper' ? '  ' + msg.dist.toFixed(1) + 'm' : ''), msg.head || msg.backstab);
      play('kill');
      if (msg.backstab) play('backstab');
      if (msg.weapon === 'sniper') killFlash = 10;
    } else if (msg.victim === myId) {
      showMsg(pit ? theme.pitDeath : msg.backstab ? 'Backstabbed!' : 'You died!');
      play(pit ? 'burn' : 'death');
    } else {
      showMsg(theme.enemyPitDeath);
      playAt('burn', msg.x, msg.y);
    }
  }
  if (msg.type === 'win') {
    const won = msg.winner === myId;
    showMsg(won ? 'YOU WIN!' : 'YOU LOSE!', true);
    play(won ? 'win' : 'lose');
    started = false;
    setTimeout(() => showWait(won ? 'You win! Pick a level and rematch?' : 'You lose. Pick a level and rematch?', 'Play Again'), 2000);
  }
  if (msg.type === 'opponentLeft') {
    started = false;
    ePrev = eCur = enemy = null;
    showWait('Opponent left — waiting for opponent to join...', "I'm Here");
  }
};

// --- Input ---
const keys = {};
let weapon = 'rifle', scoped = false, switchUntil = 0, mouseHeld = false;
const nextFire = { rifle: 0, sniper: 0, shotgun: 0, smg: 0, blade: 0 };

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === ' ') e.preventDefault();
  if (!started) return;
  const n = parseInt(k, 10);
  if (n >= 1 && n <= WEAPON_ORDER.length) switchWeapon(WEAPON_ORDER[n - 1]);
  if (k === 'q') cycleWeapon(1);
  if (k === 'f') melee(true);
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let mouseDX = 0, mouseDY = 0;
document.addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { mouseDX += e.movementX; mouseDY += e.movementY; } });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousedown', e => {
  if (!started || !me || document.pointerLockElement !== canvas) return;
  if (e.button === 2) toggleScope();
  if (e.button === 0) { mouseHeld = true; fire(); }
});
document.addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false; });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) { mouseHeld = false; scoped = false; } });
document.addEventListener('wheel', e => {
  if (!started || document.pointerLockElement !== canvas || performance.now() < switchUntil) return;
  cycleWeapon(e.deltaY < 0 ? -1 : 1);
});

function cycleWeapon(dir) {
  let i = WEAPON_ORDER.indexOf(weapon);
  for (let n = 0; n < WEAPON_ORDER.length; n++) {
    i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    if (owned(WEAPON_ORDER[i])) { switchWeapon(WEAPON_ORDER[i]); return; }
  }
}

function switchWeapon(w) {
  if (w === weapon || !owned(w)) return;
  weapon = w; scoped = false;
  switchUntil = performance.now() + 350;
  play('swap');
}

function toggleScope() {
  if (weapon !== 'sniper') return;
  if (!scoped && performance.now() < nextFire.sniper) return; // still chambering
  scoped = !scoped;
  play('scope', scoped);
}

function melee(quick) {
  const now = performance.now();
  if (now < nextFire.blade) return;
  nextFire.blade = now + WEAPONS.blade.cd;
  swingT = now;
  if (quick && weapon !== 'blade') { quickUntil = now + 320; switchUntil = Math.max(switchUntil, now + 320); }
  scoped = false;
  ws.send(JSON.stringify({ type:'shoot', weapon:'blade' }));
  play('swing');
  const lunge = onGround ? 1.6 : 0.8; // lunge forward, stacks with bhop
  vx += Math.cos(me.a) * lunge; vy += Math.sin(me.a) * lunge;
}

function fire() {
  if (weapon === 'blade') { melee(false); return; }
  const now = performance.now();
  if (now < switchUntil || now < nextFire[weapon]) return;
  nextFire[weapon] = now + WEAPONS[weapon].cd;
  if (AMMO[weapon] !== undefined && !(inv[weapon] > 0)) { play('dry'); return; }
  if (AMMO[weapon] !== undefined) inv[weapon]--; // server confirms with an inv message
  ws.send(JSON.stringify({ type:'shoot', weapon, scoped }));
  play(weapon);
  muzzle = 6; fireT = now;
  if (weapon === 'sniper') {
    recoil = 1; punch = 0.28; shake = 14; fovKick = 0.12;
    scoped = false;
    setTimeout(() => play('bolt'), 450);
  } else if (weapon === 'shotgun') {
    recoil = 1; punch = 0.12; shake = 9; fovKick = 0.05;
    setTimeout(() => play('pump'), 350);
  } else if (weapon === 'smg') { recoil = 0.25; punch = Math.max(punch, 0.015); shake = Math.max(shake, 1.5); }
  else { recoil = 0.35; punch = Math.max(punch, 0.03); shake = Math.max(shake, 2); }
}

let hitFlash = 0, muzzle = 0, recoil = 0, hitMarker = 0, hitHead = false, killFlash = 0;
let punch = 0, shake = 0, fovKick = 0, fireT = -1e9, swingT = -1e9, quickUntil = 0;
let enemyFlashT = -1e9, enemyHitT = -1e9, bannerText = '', bannerT = -1e9, bannerGold = false;
let fov = BASE_FOV, tracers = [], particles = [], corpses = [], embers = [];
let cam = null;

// --- Movement (Quake-style: holding space skips ground friction, air strafing adds speed) ---
let vx = 0, vy = 0, vz = 0, onGround = true, stepAcc = 0, speed = 0, bobPhase = 0;

function footGround(x, y) {
  const r = 0.2;
  return Math.max(groundAt(T, x, y), groundAt(T, x+r, y+r), groundAt(T, x-r, y-r), groundAt(T, x+r, y-r), groundAt(T, x-r, y+r));
}

function accelerate(wx, wy, wishSpeed, accel, dt) {
  const add = wishSpeed - (vx*wx + vy*wy);
  if (add <= 0) return;
  const acc = Math.min(add, accel * wishSpeed * dt);
  vx += acc * wx; vy += acc * wy;
}

function airAccelerate(wx, wy, wishSpeed, dt) {
  const add = Math.min(wishSpeed, AIR_CAP) - (vx*wx + vy*wy);
  if (add <= 0) return;
  const acc = Math.min(add, AIR_ACCEL * wishSpeed * dt);
  vx += acc * wx; vy += acc * wy;
}

function applyFriction(dt) {
  const sp = Math.hypot(vx, vy);
  if (sp < 0.001) { vx = vy = 0; return; }
  const drop = Math.max(sp, STOP_SPEED) * FRICTION * dt;
  const k = Math.max(0, sp - drop) / sp;
  vx *= k; vy *= k;
}

const inPit = () => me && T && kindAt(T, me.x, me.y) === 2 && me.z < -0.15;

function update(dt) {
  if (!started || !me) { setLoop(windGain, 0); setLoop(sizzleGain, 0); return; }
  const sens = SENS * (scoped ? 0.3 : 1);
  me.a += mouseDX * sens;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - mouseDY * sens));
  mouseDX = mouseDY = 0;

  const cos = Math.cos(me.a), sin = Math.sin(me.a);
  let fx = 0, sx = 0;
  if (keys['w']) fx++;
  if (keys['s']) fx--;
  if (keys['d']) sx++;
  if (keys['a']) sx--;
  let wx = cos*fx - sin*sx, wy = sin*fx + cos*sx;
  const wl = Math.hypot(wx, wy);
  if (wl > 0) { wx /= wl; wy /= wl; }
  const wishSpeed = wl > 0 ? MAX_SPEED * (scoped ? 0.55 : weapon === 'blade' ? 1.15 : 1) : 0;

  if (onGround && keys[' ']) { vz = JUMP_V; onGround = false; play('jump'); }
  if (onGround) { applyFriction(dt); accelerate(wx, wy, wishSpeed, ACCEL, dt); }
  else airAccelerate(wx, wy, wishSpeed, dt);

  speed = Math.hypot(vx, vy);
  if (speed > SPEED_LIMIT) { vx *= SPEED_LIMIT / speed; vy *= SPEED_LIMIT / speed; speed = SPEED_LIMIT; }

  // terrain collision: walls and pit edges block unless you jump over/out
  const tol = onGround ? STEP : 0.12;
  const nx = me.x + vx*dt;
  if (footGround(nx, me.y) <= me.z + tol) me.x = nx; else vx = 0;
  const ny = me.y + vy*dt;
  if (footGround(me.x, ny) <= me.z + tol) me.y = ny; else vy = 0;

  const g = footGround(me.x, me.y);
  if (onGround) {
    if (g >= me.z - 0.12) me.z = g;
    else { onGround = false; vz = 0; } // walked off a ledge into a pit
  }
  if (!onGround) {
    vz -= GRAVITY * dt;
    me.z += vz * dt;
    if (me.z <= g) { me.z = g; vz = 0; onGround = true; play('land'); }
  }

  if (onGround && speed > 0.5) {
    bobPhase += speed * dt * 2.2;
    stepAcc += speed * dt;
    if (stepAcc > 0.85) { stepAcc = 0; play('step'); }
  }
  setLoop(windGain, Math.max(0, Math.min(1, (speed - 3) / 6)) * 0.3);
  setLoop(sizzleGain, inPit() ? 0.25 : 0);
  if (inPit() && Math.random() < 0.3) burst(me.x, me.y, me.z, 1, 'fire');

  ws.send(JSON.stringify({ type:'input', x:me.x, y:me.y, z:me.z, a:me.a, p:pitch, sc:scoped, seq:mySeq }));
}

// --- Particles ---
function burst(x, y, z, n, kind) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = Math.random() * (kind === 'spark' ? 3 : 2.2), life = 0.4 + Math.random() * (kind === 'fire' ? 1.2 : 0.8);
    const b = theme.blood, f = theme.fire;
    const col = kind === 'blood' ? [b[0] * (0.8 + Math.random() * 0.4), b[1], b[2]] : kind === 'spark' ? [255, 170 + Math.random() * 80, 60] : [f[0], f[1] * (0.6 + Math.random() * 0.6), f[2]];
    particles.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * 2.5 + (kind === 'fire' ? 0.5 : 0),
      g: kind === 'fire' ? -1.5 : 7, life, max: life, col, size: kind === 'blood' ? 0.05 : 0.035, emit: kind !== 'blood' });
  }
}

function updateEmbers() {
  while (embers.length < 110) {
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 9;
    const x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r;
    const life = 3 + Math.random() * 4, c = theme.ambient;
    embers.push({ x, y, z: Math.random() * 2.5, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      vz: theme.ambientVz * (0.4 + Math.random() * 1.2), g: 0, life, max: life, col: [c[0], c[1] * (0.7 + Math.random() * 0.5), c[2]], size: 0.025, emit: true });
  }
}

function stepParticles(list, dt) {
  for (const p of list) {
    p.vz -= p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const gz = groundAt(T, p.x, p.y);
    if (p.z < gz) { p.z = gz; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }
    p.life -= dt;
  }
  return list.filter(p => p.life > 0);
}

// --- Rendering ---
function drawTerrain(now) {
  const { eye, horizon, focal, tanH, fwdx, fwdy, rtx, rty } = cam;
  const t = now / 1000, th = theme, robot = th.id === 'robot';
  const lo = th.skyLo, hi = th.skyHi;
  for (let y = 0; y < RH; y++) {
    const el = (horizon - y) / focal;
    if (el < 0) skyRow[y] = pk(th.fog[0], th.fog[1], th.fog[2]);
    else { const k = Math.min(1, Math.sqrt(el / 0.8)); skyRow[y] = pk(lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k); }
  }
  const TW = T.TW, TH = T.TH, hg = T.hgt, kd = T.kind, fr = th.fog[0], fg = th.fog[1], fb = th.fog[2];
  const wc = th.wall, bc = th.band, pulse = 0.7 + 0.3 * Math.sin(t * 3);
  const fogF = ZS.map(z => 1 - Math.exp(-z * th.fogK));
  for (let c = 0; c < RW; c++) {
    const camX = (2 * (c + 0.5) / RW - 1) * tanH, dx = fwdx + rtx * camX, dy = fwdy + rty * camX;
    let ybot = RH, prevI = -1;
    for (let s = 0; s < ZS.length; s++) {
      const z = ZS[s], wx = me.x + dx * z, wy = me.y + dy * z;
      if (wx < 0 || wy < 0) break;
      const i = (wx * RES) | 0, j = (wy * RES) | 0;
      if (i >= TW || j >= TH) break;
      const k = j * TW + i, h = hg[k], sy = horizon - (h - eye) * focal / z;
      const xFace = i !== prevI; prevI = i;
      if (sy >= ybot) continue;
      const ytop = sy < 0 ? 0 : sy | 0, f = fogF[s], kind = kd[k];
      if (kind === 1) {
        // wall: texture by world height (hell: glowing rune bands; robot: steel panels with a light strip)
        const sh = xFace ? 0.75 : 1, seam = ((wx + wy) * (robot ? 1 : 2)) % 1 < 0.05 ? 0.6 : 1;
        for (let y = ytop; y < ybot; y++) {
          const hh = eye + (horizon - y - 0.5) * z / focal;
          let r, g, b, ff = f;
          if (hh > h - 0.05) { r = CR[k]; g = CG[k]; b = CB[k]; }
          else if (robot ? (hh > 0.9 && hh < 0.97) : (h - hh) % 0.9 < 0.06) { r = bc[0] * pulse; g = bc[1] * pulse; b = bc[2] * pulse; ff = f * 0.5; }
          else if (robot && (h - hh) % 0.4 < 0.03) { r = wc[0] * 0.5; g = wc[1] * 0.5; b = wc[2] * 0.5; }
          else { const m = sh * seam; r = wc[0] * m; g = wc[1] * m; b = wc[2] * m; }
          const idx = y * RW + c;
          pix[idx] = pk(r + (fr - r) * ff, g + (fg - g) * ff, b + (fb - b) * ff); zbuf[idx] = z;
        }
      } else {
        let r, g, b, ff = f;
        if (kind === 2) {
          const v = 0.5 + 0.5 * Math.sin(wx * 3.1 + t * 1.7) * Math.sin(wy * 2.7 - t * 1.3);
          if (robot) { r = 20 + v * 60; g = 200 + v * 55; b = 120 + v * 80; } else { r = 255; g = 60 + v * 130; b = 10 + v * 40; }
          ff = f * 0.4;
        } else { r = CR[k]; g = CG[k]; b = CB[k]; if (EM[k]) { ff = f * 0.5; g *= 0.8 + 0.2 * Math.sin(t * 2 + wx); } }
        const col = pk(r + (fr - r) * ff, g + (fg - g) * ff, b + (fb - b) * ff);
        for (let y = ytop; y < ybot; y++) { const idx = y * RW + c; pix[idx] = col; zbuf[idx] = z; }
      }
      ybot = ytop;
      if (ybot <= 0) break;
    }
    // sky with a moon (hell) or planet (robot)
    let md = me.a + Math.atan(camX) - th.orbA;
    md = Math.atan2(Math.sin(md), Math.cos(md));
    const R = th.orbR, oc = th.orb, og = th.orbGlow;
    for (let y = 0; y < ybot; y++) {
      const idx = y * RW + c;
      zbuf[idx] = 1e9;
      if (Math.abs(md) < R + 0.25) {
        const de = (horizon - y) / focal - th.orbE, d = Math.hypot(md, de);
        if (d < R) {
          const cr = robot ? 0.8 + 0.2 * Math.sin(de * 60) : 0.85 + 0.15 * Math.sin(md * 90) * Math.sin(y * 0.7);
          pix[idx] = pk(oc[0] * cr, oc[1] * cr, oc[2] * cr); continue;
        }
        if (d < R + 0.22) {
          const gl = (1 - (d - R) / 0.22) ** 2, s = skyRow[y];
          pix[idx] = pk((s & 255) + og[0] * gl, ((s >> 8) & 255) + og[1] * gl, ((s >> 16) & 255) + og[2] * gl); continue;
        }
      }
      pix[idx] = skyRow[y];
    }
  }
}

// billboard shapes: u across, v=0 at top, v=1 at bottom; return a palette index (0 = transparent)
function demonPx(u, v, glint) {
  const du = Math.abs(u - 0.5);
  if (glint && Math.abs(u - 0.57) < 0.05 && Math.abs(v - 0.17) < 0.03) return 6;
  if (v < 0.13) { const hx = 0.16 + (0.13 - v) * 1.2; if (Math.abs(du - hx) < 0.045) return 3; return 0; }
  if (v < 0.3) {
    if (du < 0.16) { if (v > 0.15 && v < 0.2 && Math.abs(du - 0.07) < 0.035) return 4; return du > 0.12 ? 2 : 1; }
    return 0;
  }
  if (v < 0.68) { const hw = 0.38 - (v - 0.3) * 0.35; if (du < hw) return du > hw - 0.07 ? 2 : 1; return 0; }
  if (Math.abs(du - 0.12) < 0.08) return 5;
  return 0;
}
function robotPx(u, v, glint) {
  const du = Math.abs(u - 0.5);
  if (glint && du < 0.05 && Math.abs(v - 0.18) < 0.03) return 6;
  if (v < 0.1) { if (v < 0.03 && du < 0.035) return 4; return du < 0.015 ? 3 : 0; }
  if (v < 0.3) { if (du < 0.18) { if (v > 0.15 && v < 0.21 && du < 0.13) return 4; return du > 0.15 ? 2 : 1; } return 0; }
  if (v < 0.34) return du < 0.07 ? 2 : 0;
  if (v < 0.66) {
    if (du < 0.3) { if (v > 0.4 && v < 0.46 && du < 0.05) return 7; return du > 0.25 ? 2 : 1; }
    return du < 0.38 && v < 0.58 ? 2 : 0;
  }
  return Math.abs(du - 0.13) < 0.07 ? 5 : 0;
}
const gunPxCache = {};
function gunPx(w) {
  return gunPxCache[w] || (gunPxCache[w] = (u, v) => {
    if (w === 'sniper' && v > 0.12 && v < 0.3 && u > 0.35 && u < 0.65) return 2;
    if (v > 0.3 && v < 0.55 && u > 0.08 && u < 0.82) return v > 0.4 && v < 0.45 && u > 0.15 && u < 0.75 ? 3 : 1;
    if (v > 0.36 && v < 0.48 && u >= 0.82) return 2;
    if (v >= 0.55 && v < 0.95 && u > 0.14 && u < 0.28) return 2;
    if (w === 'smg' && v >= 0.55 && v < 0.9 && u > 0.45 && u < 0.56) return 2;
    if (w === 'shotgun' && v >= 0.55 && v < 0.68 && u > 0.5 && u < 0.8) return 2;
    return 0;
  });
}
const SPRITES = {
  demon: { px: demonPx, emit: [4, 6], pal: [null, [150, 30, 25], [85, 14, 14], [205, 185, 150], [255, 220, 60], [35, 14, 14], [255, 255, 255]] },
  robot: { px: robotPx, emit: [4, 6, 7], pal: [null, [140, 150, 165], [70, 76, 88], [185, 190, 200], [255, 40, 30], [50, 54, 62], [255, 255, 255], [40, 220, 255]] },
};

// draw a billboard into the low-res buffer with depth testing; w/h are world size, ez is its bottom
function drawSprite(ex, ey, ez, w, h, px, pal, emit, flash, glint) {
  const { eye, horizon, focal, fwdx, fwdy, rtx, rty } = cam;
  const dx = ex - me.x, dy = ey - me.y, f = dx * fwdx + dy * fwdy;
  if (f < 0.15) return;
  const cx = RW / 2 + (dx * rtx + dy * rty) / f * focal, hw = w / 2 / f * focal;
  const y0 = horizon - (ez + h - eye) / f * focal, y1 = horizon - (ez - eye) / f * focal;
  const xa = Math.max(0, Math.floor(cx - hw)), xb = Math.min(RW - 1, Math.ceil(cx + hw));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(RH - 1, Math.ceil(y1));
  if (xa > xb || ya > yb) return;
  const fog = 1 - Math.exp(-f * theme.fogK), F = theme.fog;
  const cols = pal.map((c, i) => {
    if (!c) return 0;
    const em = emit.indexOf(i) >= 0, ff = em ? fog * 0.3 : fog, m = flash && !em ? 2.2 : 1, add = flash && !em ? 80 : 0;
    return pk(Math.min(255, c[0] * m) * (1 - ff) + F[0] * ff, Math.min(255, c[1] * m + add) * (1 - ff) + F[1] * ff, Math.min(255, c[2] * m + add) * (1 - ff) + F[2] * ff);
  });
  for (let x = xa; x <= xb; x++) {
    const u = (x + 0.5 - (cx - hw)) / (2 * hw);
    for (let y = ya; y <= yb; y++) {
      const idx = y * RW + x;
      if (zbuf[idx] <= f) continue;
      const p = px(u, (y + 0.5 - y0) / (y1 - y0), glint);
      if (!p) continue;
      pix[idx] = cols[p]; zbuf[idx] = f;
    }
  }
}

function drawPlayer(x, y, z, hScale, wScale, flash, glint) {
  const s = SPRITES[theme.sprite];
  drawSprite(x, y, z, 0.6 * wScale, (BODY_H + 0.12) * hScale, s.px, s.pal, s.emit, flash, glint);
}

function drawParticles(list) {
  const { eye, horizon, focal, fwdx, fwdy, rtx, rty } = cam, F = theme.fog;
  for (const p of list) {
    const dx = p.x - me.x, dy = p.y - me.y, f = dx * fwdx + dy * fwdy;
    if (f < 0.1) continue;
    const sx = (RW / 2 + (dx * rtx + dy * rty) / f * focal) | 0, sy = (horizon - (p.z - eye) / f * focal) | 0;
    const size = Math.max(1, Math.min(4, (p.size / f * focal) | 0));
    const k = Math.min(1, p.life / p.max * 2), ff = (1 - Math.exp(-f * theme.fogK)) * (p.emit ? 0.4 : 1);
    const col = pk((p.col[0] * k) * (1 - ff) + F[0] * ff, (p.col[1] * k) * (1 - ff) + F[1] * ff, (p.col[2] * k) * (1 - ff) + F[2] * ff);
    for (let y = sy; y < sy + size; y++) for (let x = sx; x < sx + size; x++) {
      if (x < 0 || y < 0 || x >= RW || y >= RH) continue;
      const idx = y * RW + x;
      if (zbuf[idx] > f) pix[idx] = col;
    }
  }
}

// world point -> full-res screen point
function project(x, y, z) {
  const dx = x - me.x, dy = y - me.y, f = dx * cam.fwdx + dy * cam.fwdy;
  return { f, x: (RW / 2 + (dx * cam.rtx + dy * cam.rty) / f * cam.focal) * cam.sc + cam.ox,
    y: (cam.horizon - (z - cam.eye) / f * cam.focal) * cam.sc + cam.oy };
}
function occluded(p) {
  const bx = ((p.x - cam.ox) / cam.sc) | 0, by = ((p.y - cam.oy) / cam.sc) | 0;
  if (bx < 0 || by < 0 || bx >= RW || by >= RH) return true;
  return zbuf[by * RW + bx] < p.f - 0.2;
}

function drawTracers(now) {
  tracers = tracers.filter(t => now - t.t < (t.weapon === 'sniper' ? 1500 : 90));
  const near = 0.1;
  ctx.lineCap = 'round';
  for (const t of tracers) {
    let a = { x:t.x0, y:t.y0, z:t.z0 }, b = { x:t.x1, y:t.y1, z:t.z1 };
    if (t.mine) { a.x -= Math.sin(me.a) * 0.15; a.y += Math.cos(me.a) * 0.15; } // from the gun, right of center
    const fa = (a.x - me.x) * cam.fwdx + (a.y - me.y) * cam.fwdy, fb = (b.x - me.x) * cam.fwdx + (b.y - me.y) * cam.fwdy;
    if (fa < near && fb < near) continue;
    const lerp = (p, q, u) => ({ x:p.x + (q.x - p.x) * u, y:p.y + (q.y - p.y) * u, z:p.z + (q.z - p.z) * u });
    if (fa < near) a = lerp(a, b, (near - fa) / (fb - fa));
    else if (fb < near) b = lerp(a, b, (near - fa) / (fb - fa));
    const A = project(a.x, a.y, a.z), B = project(b.x, b.y, b.z), age = now - t.t;
    if (t.weapon === 'sniper') {
      const k = 1 - age / 1500, hot = Math.max(0, 1 - age / 250);
      ctx.strokeStyle = 'rgba(120,110,110,' + (k * 0.35) + ')'; ctx.lineWidth = 3 + age / 60; // smoke trail
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      if (hot > 0) {
        ctx.strokeStyle = 'rgba(' + theme.accent + ',' + (hot * 0.6) + ')'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,240,220,' + hot + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(255,210,120,' + (0.7 * (1 - age / 90)) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
  }
}

function glow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// --- First-person weapon models ---
// Drawn in a local frame anchored at the bottom-right of the screen and rotated so -y points
// toward the crosshair; y=0 is the near end, y=-L the muzzle. Widths taper for perspective.
function seg(L, y0, y1, hw0, hw1, xo, fill) {
  const k = y => 1 - 0.45 * Math.min(1, Math.max(0, -y / L));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo((xo - hw0) * k(y0), y0); ctx.lineTo((xo - hw1) * k(y1), y1);
  ctx.lineTo((xo + hw1) * k(y1), y1); ctx.lineTo((xo + hw0) * k(y0), y0);
  ctx.closePath(); ctx.fill();
}
const GUN_LEN = { rifle: 34, sniper: 42, shotgun: 30, smg: 27, blade: 30 };
function drawViewmodel(now) {
  const u = Math.min(W, H * 1.6) / 100;
  const moving = onGround ? Math.min(speed, 4) : 0;
  const bx = Math.sin(bobPhase) * moving * 0.4 * u, by = Math.abs(Math.cos(bobPhase)) * moving * 0.3 * u;
  const showBlade = weapon === 'blade' || now < quickUntil, w = showBlade ? 'blade' : weapon;
  const ax = W / 2 + 26 * u + bx, ay = H + 3 * u + by;
  const tx = W / 2 + 4 * u, ty = H / 2 + 10 * u;
  const ang = Math.atan2(tx - ax, ay - ty); // rotation that points local -y at the target
  const t = now / 1000, glowC = 'rgba(' + theme.accent + ',' + (0.65 + 0.35 * Math.sin(t * 4)) + ')';
  const L = GUN_LEN[w], kick = recoil * (w === 'sniper' || w === 'shotgun' ? 6 : 3);
  const robot = theme.id === 'robot', dark = robot ? '#262b33' : '#221a1c', mid = robot ? '#3c434e' : '#35292b', light = robot ? '#58616e' : '#4a3a3a';
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang + recoil * 0.12);
  ctx.scale(u, u);
  ctx.translate(0, kick);
  if (w === 'blade') {
    const p = Math.min(1, (now - swingT) / 250), sw = p < 1 ? Math.sin(p * Math.PI) : 0;
    ctx.rotate(-sw * 1.4); ctx.translate(-sw * 10, -sw * 4);
    seg(L, 3, -9, 2.2, 2, 0, dark);                          // grip
    seg(L, -9, -11, 5, 4.6, 0, light);                        // guard
    ctx.fillStyle = mid;                                      // blade
    ctx.beginPath(); ctx.moveTo(-2.2, -11); ctx.lineTo(-2.6, -20); ctx.lineTo(-1, -23); ctx.lineTo(-1.8, -27); ctx.lineTo(0.3, -L);
    ctx.lineTo(1.6, -26); ctx.lineTo(1, -22); ctx.lineTo(1.8, -16); ctx.lineTo(2, -11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = glowC; ctx.lineWidth = 0.35; ctx.stroke();
  } else if (w === 'rifle') {
    seg(L, 3, -14, 5.4, 4.4, 0, mid);        // receiver
    seg(L, -7, -13, 2.2, 2, -5.6, dark);      // magazine
    seg(L, -14, -26, 3.4, 2.8, 0, dark);      // handguard
    seg(L, -26, -L, 1.3, 1.1, 0, '#111');     // barrel
    seg(L, -10, -13, 1.2, 1.1, 0, light);     // rear sight
    seg(L, 1, -24, 0.7, 0.6, 1.6, glowC);     // accent strip
  } else if (w === 'smg') {
    seg(L, 3, -13, 4.6, 4, 0, mid);
    seg(L, -5, -14, 1.8, 1.7, -5.2, dark);    // long mag
    seg(L, -13, -20, 3, 2.6, 0, dark);
    seg(L, -20, -L, 1.2, 1, 0, '#111');
    seg(L, 0, -18, 0.6, 0.5, 1.4, glowC);
  } else if (w === 'shotgun') {
    const pump = Math.max(0, 1 - Math.abs(now - fireT - 450) / 200) * 4; // pump slides back after a shot
    seg(L, 3, -12, 5.8, 5, 0, mid);
    seg(L, -12, -L, 1.6, 1.3, -1.5, '#111');  // twin barrels
    seg(L, -12, -L, 1.6, 1.3, 1.5, '#111');
    seg(L, -13 + pump, -21 + pump, 3.8, 3.3, 0, light); // pump
    seg(L, 1, -11, 0.7, 0.6, 2.5, glowC);
  } else {
    const bp = now - fireT - 450, bolt = bp > 0 && bp < 400 ? Math.sin(bp / 400 * Math.PI) * 4 : 0;
    seg(L, 3, -12, 5, 4.4, 0, mid);           // stock + receiver
    seg(L, -12, -20, 3.4, 3, 0, dark);
    seg(L, -20, -L, 1.2, 0.9, 0, '#111');     // long barrel
    seg(L, -8, -24, 2.5, 2.2, 0, '#0d0d0f');  // scope tube
    seg(L, -23, -25, 2.8, 2.5, 0, light);     // scope bell
    seg(L, -10 + bolt, -12 + bolt, 1, 1, 4.6, light); // bolt handle
    seg(L, 2, -18, 0.6, 0.5, 3.4, glowC);
  }
  ctx.restore();
  if (muzzle > 0 && !showBlade) {
    const tip = (L - kick) * u, mx = ax + Math.sin(ang) * tip, my = ay - Math.cos(ang) * tip;
    glow(mx, my, (w === 'sniper' || w === 'shotgun' ? 11 : 5) * u * muzzle / 6, 'rgba(255,210,110,0.95)');
  }
}

function drawMinimap(now) {
  const size = Math.min(230, Math.round(Math.min(W, H) * 0.3)), mx = W - size - 12, my = 12, cx = mx + size / 2, cy = my + size / 2, ms = size / 14;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx, my, size, size);
  ctx.beginPath(); ctx.rect(mx, my, size, size); ctx.clip();
  // rotate the world so your facing direction points up
  ctx.translate(cx, cy);
  ctx.rotate(-me.a - Math.PI / 2);
  ctx.scale(ms, ms);
  ctx.translate(-me.x, -me.y);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(mini, 0, 0, MW, MH);
  ctx.globalAlpha = 1;
  pickupSpots.forEach((p, i) => {
    if (!pickupActive[i]) return;
    ctx.fillStyle = 'rgb(' + GUN_COLOR[p.weapon].join(',') + ')'; ctx.fillRect(p.x - 0.25, p.y - 0.25, 0.5, 0.5);
  });
  if (enemy) { ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.arc(enemy.x, enemy.y, 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#fa4'; // you: arrow pointing up
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5, cy + 6); ctx.lineTo(cx - 5, cy + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(' + theme.accent + ',0.6)'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, size, size);

  // weapons under the minimap
  ctx.font = 'bold 15px Courier New'; ctx.textAlign = 'right';
  WEAPON_ORDER.forEach((w, i) => {
    const y = my + size + 22 + i * 22, has = owned(w);
    ctx.fillStyle = w === weapon ? '#fc6' : has ? '#aaa' : '#444';
    const ammo = AMMO[w] !== undefined && has ? ' ' + inv[w] : '';
    ctx.fillText((w === weapon ? '> ' : '') + (i + 1) + ' ' + w.toUpperCase() + ammo, mx + size, y);
  });
  ctx.font = '12px Courier New'; ctx.fillStyle = '#777';
  ctx.fillText('F quick melee', mx + size, my + size + 22 + WEAPON_ORDER.length * 22);
  const cd = WEAPONS[weapon].cd, left = nextFire[weapon] - now;
  if (cd > 400 && left > 0) { ctx.fillStyle = 'rgb(' + theme.accent + ')'; ctx.fillRect(mx, my + size + 6, size * (1 - left / cd), 3); }
  ctx.textAlign = 'left';
}

function render(dt) {
  if (!me || !T) return;
  const now = performance.now();

  // interpolate the enemy one server tick behind
  if (eCur) {
    const k = Math.min(1, (now - eTime) / ${TICK});
    enemy = Object.assign({}, eCur, { x: ePrev.x + (eCur.x - ePrev.x) * k, y: ePrev.y + (eCur.y - ePrev.y) * k, z: ePrev.z + (eCur.z - ePrev.z) * k });
  }

  fov += ((scoped ? SCOPE_FOV : BASE_FOV) - fov) * 0.3;
  const tanH = Math.tan(fov / 2) * (1 + fovKick), focal = (RW / 2) / tanH;
  const ox = shake ? (Math.random() - 0.5) * shake : 0, oy = shake ? (Math.random() - 0.5) * shake : 0;
  cam = { eye: me.z + EYE, horizon: RH / 2 + (pitch + punch) * focal, focal, tanH, sc: W / RW, ox, oy,
    fwdx: Math.cos(me.a), fwdy: Math.sin(me.a), rtx: -Math.sin(me.a), rty: Math.cos(me.a) };

  if (started) updateEmbers();
  embers = stepParticles(embers, dt);
  particles = stepParticles(particles, dt);
  for (const c of corpses) {
    c.vz -= GRAVITY * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    const gz = groundAt(T, c.x, c.y);
    if (gz > c.z + 0.5) { c.x -= c.vx * dt; c.y -= c.vy * dt; c.vx = c.vy = 0; } // hit a wall
    if (c.z < gz) { c.z = gz; if (!c.landed && c.vz < -1) { c.landed = true; playAt('thud', c.x, c.y); } c.vz = 0; c.vx *= 0.85; c.vy *= 0.85; }
  }
  corpses = corpses.filter(c => now - c.t < 6000);

  drawTerrain(now);
  pickupSpots.forEach((p, i) => {
    if (!pickupActive[i]) return;
    drawSprite(p.x, p.y, 0.3 + 0.07 * Math.sin(now / 400 + i), 0.7, 0.35, gunPx(p.weapon), [null, [70, 70, 78], [30, 30, 34], GUN_COLOR[p.weapon]], [3]);
  });
  for (const c of corpses) {
    if (c.mine) continue;
    const age = now - c.t, fall = Math.min(1, age / 450), sink = age > 4000 ? (age - 4000) / 2000 * 0.4 : 0;
    drawPlayer(c.x, c.y, c.z - sink, 1 - 0.72 * fall, 1 + 0.9 * fall, false, false);
  }
  if (enemy) drawPlayer(enemy.x, enemy.y, enemy.z, 1, 1, now - enemyHitT < 90, enemy.sc);
  drawParticles(embers);
  drawParticles(particles);

  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(off, ox, oy, W, H);

  // glowing pickup pads
  pickupSpots.forEach((p, i) => {
    const q = project(p.x, p.y, 0.05);
    if (q.f < 0.3 || occluded(q)) return;
    glow(q.x, q.y, (pickupActive[i] ? 260 : 120) / q.f, 'rgba(' + GUN_COLOR[p.weapon].join(',') + ',' + (pickupActive[i] ? 0.45 : 0.15) + ')');
  });
  drawTracers(now);
  // enemy muzzle flash and scope glint (only if not behind a wall)
  if (enemy) {
    if (now - enemyFlashT < 70) { const p = project(enemy.x, enemy.y, enemy.z + EYE - 0.1); if (p.f > 0.2 && !occluded(p)) glow(p.x, p.y, 160 / p.f + 20, 'rgba(255,210,90,0.9)'); }
    if (enemy.sc) { const p = project(enemy.x, enemy.y, enemy.z + EYE); if (p.f > 0.2 && !occluded(p)) glow(p.x, p.y, 18 + 8 * Math.sin(now / 120), 'rgba(255,240,230,0.9)'); }
  }

  const cx = W / 2, cy = H / 2;
  if (scoped && fov < BASE_FOV * 0.6) {
    const r = Math.min(W, H) * 0.45;
    const lens = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
    lens.addColorStop(0, 'rgba(0,0,0,0)'); lens.addColorStop(1, 'rgba(' + theme.accent + ',0.25)');
    ctx.fillStyle = lens; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill('evenodd');
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); // thick posts
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.35, cy); ctx.moveTo(cx + r * 0.35, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy + r * 0.35); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.fillStyle = '#000';
    for (let i = 1; i <= 4; i++) { const d = r * 0.07 * i; ctx.fillRect(cx - d - 1.5, cy - 1.5, 3, 3); ctx.fillRect(cx + d - 1.5, cy - 1.5, 3, 3); ctx.fillRect(cx - 1.5, cy + d - 1.5, 3, 3); }
    ctx.fillStyle = '#f22'; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  } else {
    // crosshair (none for an unscoped sniper, like CS); gap opens in the air and on recoil
    if (weapon === 'blade') {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
    } else if (weapon === 'shotgun') {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 22 + recoil * 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
    } else if (weapon === 'sniper') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 1, cy - 1, 2, 2); }
    else {
      const g = 4 + (onGround ? 0 : 8) + recoil * 10, l = 8;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(cx-g-l,cy); ctx.lineTo(cx-g,cy); ctx.moveTo(cx+g,cy); ctx.lineTo(cx+g+l,cy);
      ctx.moveTo(cx,cy-g-l); ctx.lineTo(cx,cy-g); ctx.moveTo(cx,cy+g); ctx.lineTo(cx,cy+g+l); ctx.stroke();
    }
    drawViewmodel(now);
  }
  if (muzzle > 0) muzzle--;

  if (hitMarker > 0) {
    const big = hitHead ? 1.6 : 1, a = hitMarker / 14;
    ctx.strokeStyle = hitHead ? 'rgba(255,60,30,' + a + ')' : 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = hitHead ? 3 : 2; ctx.beginPath();
    const o = 12 * big, i = 5 * big;
    ctx.moveTo(cx-o,cy-o); ctx.lineTo(cx-i,cy-i); ctx.moveTo(cx+o,cy-o); ctx.lineTo(cx+i,cy-i);
    ctx.moveTo(cx-o,cy+o); ctx.lineTo(cx-i,cy+i); ctx.moveTo(cx+o,cy+o); ctx.lineTo(cx+i,cy+i); ctx.stroke();
    hitMarker--;
  }

  if (killFlash > 0) { ctx.fillStyle = 'rgba(255,230,200,' + (killFlash / 10 * 0.25) + ')'; ctx.fillRect(0, 0, W, H); killFlash--; }
  if (hitFlash > 0) { ctx.fillStyle = 'rgba(255,0,0,' + (hitFlash / 8 * 0.35) + ')'; ctx.fillRect(0, 0, W, H); hitFlash--; }
  if (inPit()) { const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, Math.max(W, H) * 0.7); v.addColorStop(0, 'rgba(' + theme.pitOverlay + ',0.05)'); v.addColorStop(1, 'rgba(' + theme.pitOverlay + ',0.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }

  // kill / pickup banner
  const bAge = now - bannerT;
  if (bAge < 1600) {
    const a = bAge < 1200 ? 1 : 1 - (bAge - 1200) / 400, sc = 1 + Math.max(0, 1 - bAge / 150) * 0.5;
    ctx.save(); ctx.translate(cx, H * 0.3); ctx.scale(sc, sc);
    ctx.font = 'bold 40px Courier New'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgb(' + theme.accent + ')'; ctx.shadowBlur = 20;
    ctx.fillStyle = bannerGold ? 'rgba(255,200,60,' + a + ')' : 'rgba(255,90,60,' + a + ')';
    ctx.fillText(bannerText, 0, 0);
    ctx.restore();
  }

  drawMinimap(now);

  ctx.font = 'bold 16px Courier New'; ctx.textAlign = 'center';
  ctx.fillStyle = speed > MAX_SPEED + 0.1 ? '#6f6' : '#aaa';
  ctx.fillText(Math.round(speed * 320 / MAX_SPEED) + ' u/s', cx, H - 40);
  ctx.textAlign = 'left';

  // decay effects (time-based so they feel the same at any framerate)
  const decay = Math.pow(0.001, dt);
  punch *= decay ** 0.8; shake *= decay ** 1.2; fovKick *= decay; recoil *= decay ** 0.5;
  if (shake < 0.3) shake = 0;

  document.getElementById('myhp').style.width = Math.max(0, me.hp) + '%';
  document.getElementById('sk').textContent = myKills;
  if (enemy) { document.getElementById('ehp').style.width = Math.max(0, enemy.hp) + '%'; document.getElementById('ek').textContent = enemy.kills || 0; }
}

function banner(text, gold) { bannerText = text; bannerT = performance.now(); bannerGold = gold; }
function showMsg(t,persist){const el=document.getElementById('msg');el.textContent=t;el.style.opacity=1;if(!persist)setTimeout(()=>el.style.opacity=0,1500);}

setLevel('hell');
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
  update(dt);
  if (mouseHeld && WEAPONS[weapon].auto && started) fire();
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
</script>
</body>
</html>`;

// --- HTTP + WS Server ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (socket) => {
  if (clients.length >= 2) { socket.close(); return; }

  const id = nextId++;
  const sp = spawnPos(clients.length > 0 ? players[clients[0].id] : null);
  players[id] = { id, x: sp.x, y: sp.y, z: groundAt(T, sp.x, sp.y), a: Math.random() * Math.PI * 2, p: 0, sc: false,
    hp: MAX_HP, kills: 0, ready: false, seq: 0, nextFire: {}, inv: {} };
  const client = { id, socket };
  clients.push(client);
  console.log(`Player ${id} connected (${clients.length}/2)`);

  const pl = players[id];
  sendTo(client, { type: 'init', id, level, x: pl.x, y: pl.y, z: pl.z, a: pl.a, hp: MAX_HP, seq: 0 });
  sendTo(client, { type: 'pickups', active: pickups.map(p => p.active) });
  if (clients.length < 2) {
    sendTo(client, { type: 'waiting', reason: 'Waiting for opponent to join...' });
  } else {
    broadcast({ type: 'waiting', reason: "Both here — pick a level, then click \"I'm Here\" to start!" });
  }

  socket.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString('utf8'));
      const p = players[id];
      if (!p) return;

      if (msg.type === 'level') {
        if (gameOn || !LEVELS[msg.level]) return;
        level = msg.level; MAP = LEVELS[level]; T = TERRAINS[level];
        resetPickups();
        Object.values(players).forEach(pl => pl.ready = false); // everyone re-confirms on the new map
        broadcast({ type: 'level', level });
        broadcast({ type: 'waiting', reason: 'Level: ' + LEVEL_NAMES[level] + " — click \"I'm Here\" to start!" });
      }
      if (msg.type === 'ready') {
        if (gameOn) return;
        p.ready = true;
        if (clients.length === 2 && Object.values(players).every(pl => pl.ready)) startGame();
        else broadcast({ type: 'waiting', reason: 'Level: ' + LEVEL_NAMES[level] + ' — waiting for other player...' });
      }
      if (msg.type === 'input') {
        if (msg.seq !== p.seq || ![msg.x, msg.y, msg.z, msg.a, msg.p].every(Number.isFinite)) return;
        // validate movement (basic anti-cheat: don't teleport; bhop speed is capped client-side)
        const dx = msg.x - p.x, dy = msg.y - p.y;
        if (Math.hypot(dx, dy) < 1) { p.x = msg.x; p.y = msg.y; }
        const g = groundAt(T, p.x, p.y);
        p.z = Math.max(g - 0.4, Math.min(g + 2, msg.z));
        p.a = msg.a;
        p.p = Math.max(-1.2, Math.min(1.2, msg.p));
        p.sc = !!msg.sc;
      }
      if (msg.type === 'shoot') {
        const w = WEAPONS[msg.weapon];
        if (!w || !gameOn) return;
        const now = Date.now();
        if (now < (p.nextFire[msg.weapon] || 0)) return;
        if (AMMO[msg.weapon] !== undefined) {
          if (!(p.inv[msg.weapon] > 0)) return;
          p.inv[msg.weapon]--;
          if (p.inv[msg.weapon] === 0) delete p.inv[msg.weapon];
          sendInv(p);
        }
        p.nextFire[msg.weapon] = now + w.cd * 0.85; // slack for network jitter
        const res = w.melee ? doMelee(p) : doShoot(p, msg.weapon, !!msg.scoped);
        broadcast({ type: 'shot', id, weapon: msg.weapon, x: p.x, y: p.y, z: p.z,
          rays: res.rays.map(r => ({ a: r.a, p: r.p, dist: r.dist, hit: r.hit })) });
        if (res.dmg > 0) {
          const v = opponent(p), r = res.hitRay;
          v.hp -= res.dmg;
          broadcast({ type: 'hit', who: v.id, by: id, dmg: res.dmg, head: res.head, weapon: msg.weapon,
            x: p.x + Math.cos(r.a) * r.dist, y: p.y + Math.sin(r.a) * r.dist, z: w.melee ? v.z + BODY_H / 2 : p.z + EYE + r.p * r.dist });
          if (v.hp <= 0) killPlayer(v, p, { weapon: msg.weapon, head: res.head, backstab: res.backstab, dist: r.dist, a: r.a });
        }
      }
    } catch(e) {}
  });

  function handleDisconnect() {
    if (!players[id]) return;
    clients = clients.filter(c => c.id !== id);
    delete players[id];
    gameOn = false;
    console.log(`Player ${id} disconnected`);
    if (clients.length === 1) {
      Object.values(players).forEach(pl => pl.ready = false);
      broadcast({ type: 'opponentLeft' });
      broadcast({ type: 'waiting', reason: 'Opponent left — waiting for opponent to join...' });
    }
  }
  socket.on('close', handleDisconnect);
  socket.on('error', handleDisconnect);
});

// pits, pickups, and state broadcast
setInterval(() => {
  if (gameOn) {
    const now = Date.now();
    for (const p of Object.values(players)) {
      if (kindAt(T, p.x, p.y) === 2 && p.z < -0.15) {
        p.hp -= PIT_DPS * TICK / 1000;
        if (p.hp <= 0) { killPlayer(p, null, { weapon: 'pit' }); continue; }
      }
      pickups.forEach((pu, idx) => {
        if (!pu.active || Math.hypot(p.x - pu.x, p.y - pu.y) > 0.8 || p.z > 1) return;
        pu.active = false; pu.respawnAt = now + PICKUP_RESPAWN;
        p.inv[pu.weapon] = AMMO[pu.weapon];
        sendInv(p);
        broadcast({ type: 'pickup', id: p.id, weapon: pu.weapon, idx });
        broadcastPickups();
      });
    }
    let respawned = false;
    for (const pu of pickups) if (!pu.active && now >= pu.respawnAt) { pu.active = true; respawned = true; }
    if (respawned) broadcastPickups();
  }
  if (clients.length < 2) return;
  const plist = Object.values(players).map(p => ({ id:p.id, x:p.x, y:p.y, z:p.z, a:p.a, p:p.p, sc:p.sc, hp:p.hp, kills:p.kills, seq:p.seq }));
  broadcast({ type: 'state', players: plist });
}, TICK);

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║          ARENA — 3D Shooter          ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log('  ║                                      ║');
  console.log('  ║  Local:  http://localhost:' + PORT + '       ║');
  console.log('  ║                                      ║');
  console.log('  ║  For remote play, run:               ║');
  console.log('  ║    ngrok http ' + PORT + '                   ║');
  console.log('  ║  Share the ngrok URL with P2.        ║');
  console.log('  ║                                      ║');
  console.log('  ║  Levels: Hell / Robot Factory        ║');
  console.log('  ║  WASD + mouse, SPACE jump (hold=bhop)║');
  console.log('  ║  1-5/Q weapon, RMB scope, F melee    ║');
  console.log('  ║  First to 10 kills wins.             ║');
  console.log('  ║                                      ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
