// WebSocket connection and handlers for every server -> client message.
import { EYE, HEAL, TEAMS } from '/shared/config.js';
import { groundAt } from '/shared/terrain.js';
import { S, owned, nameOf, gunSlots } from './state.js';
import { setLevel } from './level.js';
import { play, playAt, spatial } from './audio.js';
import { burst } from './particles.js';
import { switchWeapon } from './weapons.js';
import { showWait, hideWait, setWaitText, showMsg, banner, toast, pushFeed } from './ui.js';
import { showRoom } from './room.js';
import { sendHello, showProfile, onAuth, showBoard } from './account.js';
import { showFriends, showInvite } from './friends.js';
import { fromProfile } from './settings.js';
import { addChat, addSystem, refreshChat } from './chat.js';
import { LEVEL_NAMES } from '/shared/levels.js';
import { syncVoice, onSignal } from './voice.js';

let ws = null;

export function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// the room code in the page URL (?room=ABCDE) picks the room; none means quick play
export function connect() {
  const code = new URLSearchParams(location.search).get('room');
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/' + (code ? '?room=' + encodeURIComponent(code) : ''));
  ws.onopen = () => sendHello();
  ws.onclose = () => { S.disconnected = true; setWaitText('Disconnected — refresh to reconnect.'); };
  ws.onerror = () => { S.disconnected = true; setWaitText('Connection failed — refresh to retry.'); };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const h = handlers[msg.type];
    if (h) h(msg, performance.now());
  };
  // leaving the page (e.g. switching rooms): hang up, or the browser may keep this page and
  // its connection alive in the back/forward cache, leaving a ghost player in the old room
  addEventListener('pagehide', () => ws.close());
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); }); // came back via Back: reconnect
}

const airborne = p => p.z - groundAt(S.T, p.x, p.y) > 0.05;

// footsteps / jump / land sounds for another player, from consecutive server states
function otherSounds(o, prev, cur) {
  if (prev.seq !== cur.seq) return;
  if (!airborne(prev) && airborne(cur)) playAt('jump', cur.x, cur.y);
  if (airborne(prev) && !airborne(cur)) playAt('land', cur.x, cur.y);
  if (!airborne(cur)) {
    o.step += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (o.step > 0.85) { o.step = 0; playAt('step', cur.x, cur.y); }
  }
}

let lastRoster = null; // id -> name, to announce joins / leaves in Messages

const handlers = {
  init(msg) {
    S.myId = msg.id;
    document.getElementById('version').textContent = 'v' + msg.version;
    setLevel(msg.level);
    S.me = { x: msg.x, y: msg.y, z: msg.z, a: msg.a, hp: msg.hp };
    S.mySeq = msg.seq;
    S.others = {};
    lastRoster = null;
    history.replaceState(null, '', '?room=' + msg.room); // the address bar is now this room's invite link
  },

  room(msg) {
    const next = Object.fromEntries(msg.players.map(p => [p.id, p.name]));
    if (lastRoster) {
      for (const id of Object.keys(next)) if (!(id in lastRoster)) addSystem(next[id] + ' joined');
      for (const id of Object.keys(lastRoster)) if (!(id in next)) addSystem(lastRoster[id] + ' left');
    }
    lastRoster = next;
    S.room = msg;
    const mine = msg.players.find(p => p.id === S.myId);
    if (mine) S.myTeam = mine.team;
    for (const id in S.others) if (!msg.players.some(p => p.id === +id)) delete S.others[id]; // left
    showRoom();
    syncVoice();
  },

  level(msg) {
    setLevel(msg.level);
    addSystem('Map leading: ' + (LEVEL_NAMES[msg.level] || msg.level));
  },

  start(msg) {
    setLevel(msg.level);
    S.started = true;
    S.myKills = 0;
    S.thrown = [];
    S.nades = 0;
    S.weapon = gunSlots()[0] || 'blade'; S.lastWeapon = 'blade'; S.scoped = false; S.reloading = null;
    S.feed = [];
    addSystem('Match started on ' + (LEVEL_NAMES[msg.level] || msg.level));
    hideWait();
  },

  // full ammo state: on respawn, or when the server disagreed with our count
  inv(msg) {
    S.mag = msg.mag; S.inv = msg.inv;
    if (msg.nades !== undefined) S.nades = msg.nades;
    if (S.reloading && !owned(S.reloading.w)) S.reloading = null;
    if (!owned(S.weapon)) { S.weapon = gunSlots()[0] || 'blade'; S.scoped = false; S.reloading = null; }
  },

  // every pad and ammo crate this match (gun pads re-roll their gun), and which are up
  pickups(msg) {
    S.pickupSpots = msg.spots;
    S.pickupActive = msg.active;
  },
  boxes(msg) { S.boxes = msg.boxes; },

  pickup(msg) {
    const sp = msg;
    burst(sp.x, sp.y, sp.z + 0.3, 20, 'spark');
    const heal = msg.weapon === 'health';
    if (msg.id !== S.myId) { playAt(heal ? 'heal' : 'pickup', sp.x, sp.y); return; }
    play(heal ? 'heal' : 'pickup');
    if (heal) { banner('+' + HEAL + ' HP', true); S.healFlash = 10; }
    else if (msg.weapon === 'ammo') banner('+ AMMO', true);
    else if (msg.weapon === 'nade') banner('+ GRENADE', true);
    else { banner('+ ' + msg.weapon.toUpperCase(), true); switchWeapon(msg.weapon); }
  },

  state(msg, now) {
    S.thrown = msg.nades || [];
    for (const p of msg.players) {
      if (p.id === S.myId) {
        S.me.hp = p.hp; S.myKills = p.kills; S.myTeam = p.team;
        // our own position is client-authoritative; only snap to the server on respawn
        if (p.seq !== S.mySeq) {
          S.mySeq = p.seq;
          Object.assign(S.me, { x: p.x, y: p.y, z: p.z, a: p.a });
          S.pitch = 0; S.vx = S.vy = S.vz = 0; S.onGround = true; S.scoped = false; S.sliding = false; S.slideDip = 0;
        }
        continue;
      }
      const o = S.others[p.id] ??= { cur: null, step: 0, flashT: -1e9, hitT: -1e9 };
      if (o.cur) otherSounds(o, o.cur, p);
      o.prev = o.cur && o.cur.seq === p.seq ? o.cur : p; // respawned: don't slide across the map
      o.cur = p; o.t = now;
    }
  },

  shot(msg, now) {
    const me = S.me, mine = msg.id === S.myId;
    const gunSound = { revolver: 'deagle', burst: 'rifle', carbine: 'rifle', lmg: 'smg', uzi: 'smg', crossbow: 'bolt' }[msg.weapon] || msg.weapon;
    if (msg.weapon === 'blade') { if (!mine) playAt('swing', msg.x, msg.y); return; }
    if (!mine) {
      if (S.others[msg.id]) S.others[msg.id].flashT = now;
      playAt(gunSound, msg.x, msg.y, msg.weapon === 'sniper' ? 2 : 1);
      if (msg.weapon === 'shotgun') setTimeout(() => playAt('pump', msg.x, msg.y), 350);
    }
    let whizzed = false;
    for (const r of msg.rays) {
      const ex = msg.x + Math.cos(r.a) * r.dist, ey = msg.y + Math.sin(r.a) * r.dist, ez = msg.z + EYE + r.p * r.dist;
      S.tracers.push({ x0: msg.x, y0: msg.y, z0: msg.z + EYE - 0.12, x1: ex, y1: ey, z1: ez, weapon: msg.weapon, t: now, mine });
      if (!r.hit) burst(ex, ey, ez, msg.weapon === 'sniper' ? 28 : msg.weapon === 'shotgun' ? 3 : 8, 'spark');
      if (!mine && !r.hit && !whizzed) {
        // a bullet passing close by cracks past your head
        const dx = ex - msg.x, dy = ey - msg.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((me.x - msg.x) * dx + (me.y - msg.y) * dy) / L2));
        const cx = msg.x + dx * t, cy = msg.y + dy * t, miss = Math.hypot(me.x - cx, me.y - cy);
        if (miss < 1.5) { play('whiz', 1 - miss / 2, spatial(cx, cy).pan); whizzed = true; }
      }
    }
  },

  nadeThrow(msg) {
    if (!S.thrown.find(n => n.id === msg.id)) S.thrown.push({ id: msg.id, x: msg.x, y: msg.y, z: msg.z });
    if (msg.by !== S.myId) playAt('swing', msg.x, msg.y);
  },
  nadeBoom(msg) {
    S.thrown = (S.thrown || []).filter(n => n.id !== msg.id);
    burst(msg.x, msg.y, msg.z, 50, 'fire');
    burst(msg.x, msg.y, msg.z, 30, 'spark');
    playAt('nade', msg.x, msg.y, 2);
    if (S.me) {
      const d = Math.hypot(msg.x - S.me.x, msg.y - S.me.y);
      if (d < 8) S.shake = Math.max(S.shake, 12 * (1 - d / 8));
    }
  },

  hit(msg, now) {
    burst(msg.x, msg.y, msg.z, msg.weapon === 'sniper' ? 40 : msg.weapon === 'shotgun' ? 30 : msg.head ? 20 : 12, 'blood');
    if (msg.weapon === 'blade') playAt('slash', msg.x, msg.y);
    if (msg.who === S.myId) { S.hitFlash = 8; play('hurt'); S.shake = Math.max(S.shake, 6); }
    else if (S.others[msg.who]) S.others[msg.who].hitT = now;
    if (msg.by === S.myId) {
      if (S.others[msg.who]) S.others[msg.who].markT = now; // they glow through walls for a bit (render/index.js)
      S.hitMarker = 14; S.hitHead = msg.head;
      play(msg.head ? 'headshot' : 'hitmarker');
    }
  },

  kill(msg, now) {
    const pit = msg.weapon === 'pit';
    const fling = { sniper: 6, shotgun: 5, blade: 3, pit: 0 }[msg.weapon] ?? 2; // how hard the body gets thrown
    const a = msg.a || 0;
    const victim = S.room && S.room.players.find(p => p.id === msg.victim);
    S.corpses.push({ x: msg.x, y: msg.y, z: msg.z, skin: victim && victim.skin, vx: Math.cos(a) * fling, vy: Math.sin(a) * fling, vz: fling * 0.5 + 1,
      t: now, landed: false, mine: msg.victim === S.myId });
    burst(msg.x, msg.y, msg.z + 0.4, 45, pit ? 'fire' : 'blood');
    burst(msg.x, msg.y, msg.z + 0.4, 25, 'fire');
    pushFeed(msg);
    {
      const kn = nameOf(msg.killer), vn = nameOf(msg.victim);
      addSystem(pit ? vn + ' fell into the pit' : kn + ' killed ' + vn + (msg.head ? ' (HS)' : msg.backstab ? ' (BS)' : '') + ' [' + msg.weapon + ']');
    }
    if (msg.killer === S.myId) {
      const label = msg.backstab ? 'BACKSTAB' : msg.head ? 'HEADSHOT' : 'KILL';
      banner(label + (msg.weapon === 'sniper' ? '  ' + msg.dist.toFixed(1) + 'm' : ''), msg.head || msg.backstab);
      play('kill');
      if (msg.backstab) play('backstab');
      if (msg.weapon === 'sniper') S.killFlash = 10;
      if (S.theme.id === 'witch') setTimeout(() => play('cackle'), 250);
    } else if (msg.victim === S.myId) {
      showMsg(pit ? S.theme.pitDeath : (msg.backstab ? 'Backstabbed by ' : 'Killed by ') + nameOf(msg.killer));
      play(pit ? 'burn' : 'death');
    } else playAt(pit ? 'burn' : 'death', msg.x, msg.y);
  },

  // { winner: id } in free-for-all, { team } in teams
  win(msg) {
    const won = msg.team ? msg.team === S.myTeam : msg.winner === S.myId;
    const who = msg.team ? TEAMS[msg.team] + ' TEAM' : nameOf(msg.winner).toUpperCase();
    showMsg(won ? (msg.team ? 'YOUR TEAM WINS!' : 'YOU WIN!') : who + ' WINS!', true);
    play(won ? 'win' : 'lose');
    addSystem(won ? (msg.team ? 'Your team wins!' : 'You win!') : who + ' wins');
    S.started = false;
    setTimeout(() => showWait(won ? 'You won! Rematch?' : who.toLowerCase().replace(/^\w/, c => c.toUpperCase()) + ' won. Rematch?'), 2000);
  },

  // the match stopped early (not enough players left)
  end(msg) {
    S.started = false;
    addSystem(msg.reason || 'Match ended');
    showWait(msg.reason);
  },

  notice(msg) { toast(msg.text); },

  chat(msg) { addChat(msg); },
  rtc(msg) { onSignal(msg); },

  profile(msg) { showProfile(msg); },
  settings(msg) { fromProfile(msg.settings); },
  auth(msg) { onAuth(msg); },
  leaderboard(msg) { showBoard(msg.rows); },
  friends(msg) { showFriends(msg.list); },
  invite(msg) { showInvite(msg); },
};
