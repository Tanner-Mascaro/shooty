// WebSocket connection and handlers for every server -> client message.
import { EYE, HEAL } from '/shared/config.js';
import { groundAt } from '/shared/terrain.js';
import { S, owned } from './state.js';
import { setLevel } from './level.js';
import { play, playAt, spatial } from './audio.js';
import { burst } from './particles.js';
import { switchWeapon } from './weapons.js';
import { showWait, hideWait, setWaitText, setReady, showMsg, banner, sendHello, showProfile } from './ui.js';

let ws = null;

export function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { setWaitText('Waiting for opponent...'); sendHello(); };
  ws.onclose = () => { setWaitText('Disconnected — refresh to reconnect.'); setReady(false); };
  ws.onerror = () => { setWaitText('Connection failed — refresh to retry.'); setReady(false); };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const h = handlers[msg.type];
    if (h) h(msg, performance.now());
  };
}

const airborne = p => p.z - groundAt(S.T, p.x, p.y) > 0.05;

// footsteps / jump / land sounds for the enemy, from consecutive server states
function enemySounds(prev, cur) {
  if (prev.seq !== cur.seq) return;
  if (!airborne(prev) && airborne(cur)) playAt('jump', cur.x, cur.y);
  if (airborne(prev) && !airborne(cur)) playAt('land', cur.x, cur.y);
  if (!airborne(cur)) {
    S.enemyStep += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (S.enemyStep > 0.85) { S.enemyStep = 0; playAt('step', cur.x, cur.y); }
  }
}

const handlers = {
  init(msg) {
    S.myId = msg.id;
    setLevel(msg.level);
    S.me = { x: msg.x, y: msg.y, z: msg.z, a: msg.a, hp: msg.hp };
    S.mySeq = msg.seq;
    setReady(true);
  },

  level(msg) {
    setLevel(msg.level);
    setReady(true, "I'm Here");
  },

  waiting(msg) { setWaitText(msg.reason); },

  profile(msg) { showProfile(msg); },

  start(msg) {
    setLevel(msg.level);
    S.started = true;
    S.myKills = 0;
    S.weapon = 'rifle'; S.scoped = false;
    hideWait();
  },

  inv(msg) {
    S.inv = msg.inv;
    if (!owned(S.weapon)) { S.weapon = 'rifle'; S.scoped = false; }
  },

  pickups(msg) { S.pickupActive = msg.active; },

  pickup(msg) {
    const sp = S.pickupSpots[msg.idx];
    burst(sp.x, sp.y, 0.3, 20, 'spark');
    const heal = msg.weapon === 'health';
    if (msg.id !== S.myId) { playAt(heal ? 'heal' : 'pickup', sp.x, sp.y); return; }
    play(heal ? 'heal' : 'pickup');
    if (heal) { banner('+' + HEAL + ' HP', true); S.healFlash = 10; }
    else { banner('+ ' + msg.weapon.toUpperCase(), true); switchWeapon(msg.weapon); }
  },

  state(msg, now) {
    const ep = msg.players.find(p => p.id !== S.myId);
    const mp = msg.players.find(p => p.id === S.myId);
    if (ep) {
      if (S.eCur) enemySounds(S.eCur, ep);
      S.ePrev = S.eCur && S.eCur.seq === ep.seq ? S.eCur : ep;
      S.eCur = ep; S.eTime = now;
    }
    if (mp) {
      S.me.hp = mp.hp; S.myKills = mp.kills;
      // our own position is client-authoritative; only snap to the server on respawn
      if (mp.seq !== S.mySeq) {
        S.mySeq = mp.seq;
        Object.assign(S.me, { x: mp.x, y: mp.y, z: mp.z, a: mp.a });
        S.pitch = 0; S.vx = S.vy = S.vz = 0; S.onGround = true; S.scoped = false;
      }
    }
  },

  shot(msg, now) {
    const me = S.me, mine = msg.id === S.myId;
    if (msg.weapon === 'blade') { if (!mine) playAt('swing', msg.x, msg.y); return; }
    if (!mine) {
      S.enemyFlashT = now;
      playAt(msg.weapon, msg.x, msg.y, msg.weapon === 'sniper' ? 2 : 1);
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

  hit(msg, now) {
    burst(msg.x, msg.y, msg.z, msg.weapon === 'sniper' ? 40 : msg.weapon === 'shotgun' ? 30 : msg.head ? 20 : 12, 'blood');
    if (msg.weapon === 'blade') playAt('slash', msg.x, msg.y);
    if (msg.who === S.myId) { S.hitFlash = 8; play('hurt'); S.shake = Math.max(S.shake, 6); }
    else S.enemyHitT = now;
    if (msg.by === S.myId) {
      S.hitMarker = 14; S.hitHead = msg.head;
      play(msg.head ? 'headshot' : 'hitmarker');
    }
  },

  kill(msg, now) {
    const pit = msg.weapon === 'pit';
    const fling = { sniper: 6, shotgun: 5, blade: 3, pit: 0 }[msg.weapon] ?? 2; // how hard the body gets thrown
    const a = msg.a || 0;
    S.corpses.push({ x: msg.x, y: msg.y, z: msg.z, vx: Math.cos(a) * fling, vy: Math.sin(a) * fling, vz: fling * 0.5 + 1,
      t: now, landed: false, mine: msg.victim === S.myId });
    burst(msg.x, msg.y, msg.z + 0.4, 45, pit ? 'fire' : 'blood');
    burst(msg.x, msg.y, msg.z + 0.4, 25, 'fire');
    if (msg.killer === S.myId) {
      const label = msg.backstab ? 'BACKSTAB' : msg.head ? 'HEADSHOT' : 'KILL';
      banner(label + (msg.weapon === 'sniper' ? '  ' + msg.dist.toFixed(1) + 'm' : ''), msg.head || msg.backstab);
      play('kill');
      if (msg.backstab) play('backstab');
      if (msg.weapon === 'sniper') S.killFlash = 10;
      if (S.theme.id === 'witch') setTimeout(() => play('cackle'), 250);
    } else if (msg.victim === S.myId) {
      showMsg(pit ? S.theme.pitDeath : msg.backstab ? 'Backstabbed!' : 'You died!');
      play(pit ? 'burn' : 'death');
    } else {
      showMsg(S.theme.enemyPitDeath);
      playAt('burn', msg.x, msg.y);
    }
  },

  win(msg) {
    const won = msg.winner === S.myId;
    showMsg(won ? 'YOU WIN!' : 'YOU LOSE!', true);
    play(won ? 'win' : 'lose');
    S.started = false;
    setTimeout(() => showWait(won ? 'You win! Pick a level and rematch?' : 'You lose. Pick a level and rematch?', 'Play Again'), 2000);
  },

  opponentLeft() {
    S.started = false;
    S.ePrev = S.eCur = S.enemy = null;
    showWait('Opponent left — waiting for opponent to join...', "I'm Here");
  },
};
