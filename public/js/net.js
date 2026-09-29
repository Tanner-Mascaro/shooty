// WebSocket connection and handlers for every server -> client message.
import { EYE, HEAL, PLAGUE_TEAM, teamName, gunGameGun, GUN_GAME_LADDER, HASTE, WARD, BROOM, INVIS, CURSE } from '/shared/config.js';
import { applyBuild, removeBuild } from '/shared/spells.js';
import { groundAt, walkHeight } from '/shared/terrain.js';
import { S, owned, nameOf, gunSlots } from './state.js';
import { setLevel, colors } from './level.js';
import { play, playAt, spatial } from './audio.js';
import { burst } from './particles.js';
import { switchWeapon } from './weapons.js';
import { showWait, hideWait, setWaitText, showMsg, showSummary, updateRematch, banner, callout, toast, pushFeed, pushNote, clearFeed } from './ui.js';
import { enterSpectate, leaveSpectate } from './spectate.js';
import { STREAK_NAMES, MULTI_NAMES, SPELL_LOOK, GUN_COLOR } from './constants.js';
import { prewarmWorld } from './render/gl/scene.js';
import { showRoom } from './room.js';
import { sendHello, showProfile, onAuth, showBoard, showMeta } from './account.js';
import { showFriends, showInvite } from './friends.js';
import { fromProfile, showControlsHint } from './settings.js';
import { addChat, addDm, addSystem, refreshChat } from './chat.js';
import { LEVEL_NAMES } from '/shared/levels.js';
import { syncVoice, onSignal } from './voice.js';
import { resetTouch } from './touch.js';
import { tutorialRoom } from './tutorial.js';
import { showParty, showPartyInvite } from './friends.js';
import { goToRoom } from './room.js';

let ws = null;

export function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ?room=ABCDE joins a private room, ?play=1 joins quick play, and bare / stays in the menu.
function open(route) {
  const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/' + route);
  S.disconnected = false;
  sock.onopen = () => sendHello();
  sock.onclose = () => { if (sock !== ws) return; S.disconnected = true; setWaitText('Disconnected — refresh to reconnect.'); };
  sock.onerror = () => { if (sock !== ws) return; S.disconnected = true; setWaitText('Connection failed — refresh to retry.'); };
  sock.onmessage = e => {
    if (sock !== ws) return;
    const msg = JSON.parse(e.data);
    const h = handlers[msg.type];
    if (h) h(msg, performance.now());
  };
}

// change rooms on this page instead of navigating, so fullscreen (and the page) stays put.
// route: '?room=CODE', '?play=1', or '' for the bare menu connection
export function switchRoom(route) {
  const old = ws;
  ws = null;
  old?.close();
  history.replaceState(null, '', route || location.pathname);
  S.started = false; S.dead = false; S.room = null; S.others = {};
  S.zone = null; S.hardpoint = null; S.corpses = []; S.thrown = [];
  setBuilds([]);
  syncVoice(); // no room: hang up every voice peer
  showWait();
  setWaitText('Connecting...');
  open(route);
}
export function connect() {
  const query = new URLSearchParams(location.search), code = query.get('room');
  open(code ? '?room=' + encodeURIComponent(code) : query.get('play') === '1' ? '?play=1' : '');
  // leaving the page: hang up, or the browser may keep this page and its connection alive in
  // the back/forward cache, leaving a ghost player in the old room
  addEventListener('pagehide', () => ws && ws.close());
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); }); // came back via Back: reconnect
}

const airborne = p => p.z - walkHeight(S.T, p.x, p.y, p.z) > 0.05;

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

function addBuild(b) {
  if (!S.T || S.builds.has(b.id)) return;
  S.builds.set(b.id, { ...b, prev: applyBuild(S.T, b.kind, b.x, b.y, b.dir, b.base || 0) });
}
// the full list (joining, or a new match): take down what's gone, raise what's new
function setBuilds(list = []) {
  for (const [id, b] of S.builds) if (!list.some(o => o.id === id)) { removeBuild(S.T, b.prev); S.builds.delete(id); }
  list.forEach(addBuild);
}

// battle royale storm; ms left in its current hold / shrink becomes a local deadline
function setZone(zone, now) {
  S.zone = zone || null;
  if (zone) S.zoneEndsAt = now + zone.ms;
}

// streaks everyone hears about: "X is on a RAMPAGE", "Y shut down X"
function announceStreak(msg) {
  if (msg.killer == null) return;
  if (msg.ended) pushNote(`${nameOf(msg.killer)} ended ${nameOf(msg.victim)}'s ${msg.ended}-kill streak`);
  if (STREAK_NAMES[msg.streak]) pushNote(`${nameOf(msg.killer)} ${msg.killer === S.myId ? 'are' : 'is'} on a ${STREAK_NAMES[msg.streak]} (${msg.streak})`);
}

let lastRoster = null; // id -> name, to announce joins / leaves in Messages

const handlers = {
  init(msg) {
    S.myId = msg.id;
    S.watching = !!msg.watching; // joined to spectate a match in progress
    tutorialRoom(!!msg.tutorial);
    document.getElementById('version').textContent = 'v' + msg.version;
    setLevel(msg.level);
    S.me = { x: msg.x, y: msg.y, z: msg.z, a: msg.a, hp: msg.hp };
    S.damageIndicators = [];
    S.mySeq = msg.seq;
    S.others = {};
    lastRoster = null;
    // only pin the invite link once you're actually in a match room (menu stays bare /)
    if (msg.room) history.replaceState(null, '', '?room=' + msg.room);
  },

  room(msg) {
    const next = Object.fromEntries(msg.players.map(p => [p.id, p.name]));
    if (lastRoster) {
      for (const id of Object.keys(next)) if (!(id in lastRoster)) addSystem(next[id] + ' joined');
      for (const id of Object.keys(lastRoster)) if (!(id in next)) addSystem(lastRoster[id] + ' left');
    }
    lastRoster = next;
    S.room = msg;
    S.hardpoint = msg.hardpoint || null;
    S.plagueEndsAt = performance.now() + (msg.plagueRemainingMs || 0);
    const mine = msg.players.find(p => p.id === S.myId);
    if (mine) S.myTeam = mine.team;
    for (const id in S.others) if (!msg.players.some(p => p.id === +id)) delete S.others[id]; // left
    showRoom();
    updateRematch();
    syncVoice();
  },

  level(msg) {
    setLevel(msg.level);
    addSystem('Map leading: ' + (LEVEL_NAMES[msg.level] || msg.level));
  },

  start(msg) {
    setLevel(msg.level);
    // build the WebGL world before flipping UI so the first frame isn't a hitch
    try { prewarmWorld(S.level, S.T, S.theme, colors); } catch {}
    S.started = true;
    S.hardpoint = msg.hardpoint || null;
    leaveSpectate();
    S.myStreak = 0; S.myGunLevel = 0;
    setZone(msg.zone, performance.now());
    setBuilds(msg.builds);
    S.spells = []; S.hasteUntil = 0; S.wardUntil = 0; S.buildMode = false;
    S.damageIndicators = [];
    S.myKills = 0;
    S.xpStart = S.xp; // the summary shows what this match earned
    resetTouch();
    S.weapon = S.clawsOnly ? 'claws' : gunSlots()[0] || 'blade'; S.lastWeapon = S.clawsOnly ? 'claws' : 'blade'; S.scoped = false; S.reloading = null;
    S.jumpsUsed = 0; S.jumpHeld = false; S.quickUntil = 0;
    S.dashUntil = 0; S.nextDash = 0;
    showControlsHint();
    clearFeed();
    S.corpses = [];
    S.plagueEndsAt = performance.now() + (msg.plagueRemainingMs || 0);
    S.thrown = []; S.nades = 0;
    addSystem('Match started on ' + (LEVEL_NAMES[msg.level] || msg.level));
    hideWait();
    if (msg.mode === 'plague') banner(S.myTeam === PLAGUE_TEAM ? 'YOU ARE THE PLAGUE' : 'STAY HEALTHY', true);
    if (msg.mode === 'gungame') banner('GUN GAME', true);
    if (msg.mode === 'royale') banner('LAST ONE STANDING', true);
  },

  // full ammo state: on respawn, or when the server disagreed with our count
  inv(msg) {
    S.mag = msg.mag; S.inv = msg.inv;
    if (msg.nades !== undefined) S.nades = msg.nades;
    if (msg.spells) S.spells = msg.spells;
    if (S.clawsOnly !== !!msg.clawsOnly) { S.dashUntil = 0; S.nextDash = 0; }
    S.clawsOnly = !!msg.clawsOnly;
    if (S.clawsOnly) {
      S.weapon = S.lastWeapon = 'claws'; S.scoped = false; S.reloading = null;
      S.aimHeld = false; S.sliding = false; S.slideArmed = false; S.quickUntil = 0; S.switchUntil = 0; S.muzzle = 0;
    }
    if (S.reloading && !owned(S.reloading.w)) S.reloading = null;
    if (!owned(S.weapon)) { S.weapon = gunSlots()[0] || 'blade'; S.scoped = false; S.reloading = null; }
    showControlsHint();
  },

  dash(msg, now) {
    if (msg.seq !== S.mySeq || !S.started || !S.clawsOnly) return;
    S.nextDash = now + msg.cooldownMs;
    if (!msg.accepted) S.dashUntil = now; // end a rejected predicted dash on the next movement frame
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
    S.pickedUp = true; // for the tutorial
    play(heal ? 'heal' : 'pickup');
    if (heal && msg.stored) banner('+ MED KIT', true); // saved as a heal in a spell slot
    else if (heal) { banner('+' + HEAL + ' HP', true); S.healFlash = 10; }
    else if (msg.weapon === 'ammo') banner('+ AMMO', true);
    else if (msg.weapon === 'nade') banner('+ POTION', true);
    else if (msg.weapon === 'scroll') banner('+ ' + msg.spell.toUpperCase() + ' SPELL', true);
    else { banner('+ ' + msg.weapon.toUpperCase(), true); switchWeapon(msg.weapon); }
  },

  state(msg, now) {
    S.plagueEndsAt = now + (msg.plagueRemainingMs || 0);
    S.hardpoint = msg.hardpoint || null;
    S.ctf = msg.ctf || null;
    setZone(msg.zone, now);
    S.thrown = msg.nades || [];
    for (const p of msg.players) {
      if (p.id === S.myId) {
        if (!p.dead) S.watching = false; // a watcher who's been spawned in is playing now
        S.me.hp = p.hp; S.myKills = p.kills; S.myTeam = p.team; S.myGunLevel = p.gl || 0;
        if (p.mn !== undefined) S.mana = p.mn;
        // our own position is client-authoritative; only snap to the server on respawn
        if (p.seq !== S.mySeq) {
          S.mySeq = p.seq;
          Object.assign(S.me, { x: p.x, y: p.y, z: p.z, a: p.a });
          S.pitch = 0; S.vx = S.vy = S.vz = 0; S.onGround = true; S.scoped = false; S.sliding = false; S.slideDip = 0;
          S.jumpsUsed = 0; S.jumpHeld = false;
          S.dashUntil = 0; S.nextDash = 0;
          S.damageIndicators = [];
          leaveSpectate();
        } else if (p.dead && !S.dead && S.started) enterSpectate(null, null); // joined a battle royale already underway
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
    const gunSound = { revolver: 'deagle', burst: 'rifle', carbine: 'rifle', lmg: 'smg', uzi: 'smg', crossbow: 'bolt', wand: 'beam' }[msg.weapon] || msg.weapon;
    if (msg.weapon === 'blade' || msg.weapon === 'claws') { if (!mine) playAt('swing', msg.x, msg.y); return; }
    if (!mine) {
      if (S.others[msg.id]) S.others[msg.id].flashT = now;
      playAt(gunSound, msg.x, msg.y, msg.weapon === 'sniper' ? 2 : 1);
      if (msg.weapon === 'shotgun') setTimeout(() => playAt('pump', msg.x, msg.y), 350);
    }
    let whizzed = false;
    for (const r of msg.rays) {
      const ex = msg.x + Math.cos(r.a) * r.dist, ey = msg.y + Math.sin(r.a) * r.dist, ez = msg.z + EYE + Math.tan(r.p) * r.dist;
      S.tracers.push({ x0: msg.x, y0: msg.y, z0: msg.z + EYE - 0.12, x1: ex, y1: ey, z1: ez, weapon: msg.weapon, t: now, mine });
      if (!r.hit) burst(ex, ey, ez, msg.weapon === 'sniper' ? 28 : msg.weapon === 'beam' ? 18 : msg.weapon === 'shotgun' ? 3 : 8, 'spark');
      if (!mine && !r.hit && !whizzed) {
        // a bullet passing close by cracks past your head
        const dx = ex - msg.x, dy = ey - msg.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((me.x - msg.x) * dx + (me.y - msg.y) * dy) / L2));
        const cx = msg.x + dx * t, cy = msg.y + dy * t, miss = Math.hypot(me.x - cx, me.y - cy);
        if (miss < 1.5) { play('whiz', 1 - miss / 2, spatial(cx, cy).pan); whizzed = true; }
      }
    }
  },

  // conjured walls / ramps: raised into our copy of the map so movement matches the server
  builds(msg) { setBuilds(msg.builds); },
  build(msg) {
    addBuild(msg);
    burst(msg.x, msg.y, 0.3, 40, 'spark');
    playAt('land', msg.x, msg.y, 1.5);
  },
  unbuild(msg) {
    const b = S.builds.get(msg.id);
    if (!b) return;
    removeBuild(S.T, b.prev);
    S.builds.delete(msg.id);
    burst(b.x, b.y, 0.8, msg.broken ? 60 : 30, 'spark');
    if (msg.broken) playAt('thud', b.x, b.y, 1.5);
  },
  // someone cast a stored spell (heal / haste / ward)
  spell(msg, now) {
    const look = SPELL_LOOK[msg.spell];
    burst(msg.x, msg.y, msg.z + 0.5, 30, 'spark', look && look.col);
    if (msg.to) burst(msg.to.x, msg.to.y, msg.to.z + 0.5, 30, 'spark', look.col); // where a blink lands
    if (msg.target === S.myId) { // someone cursed you
      S.cursedUntil = now + CURSE.ms; S.hitFlash = 6; play('hurt');
      banner('CURSED — SLOWED', false);
    }
    if (msg.id !== S.myId) { playAt('heal', msg.x, msg.y); return; }
    play('heal');
    S.castSpell = true; // for the tutorial
    if (msg.spell === 'heal') S.healFlash = 10;
    if (msg.spell === 'haste') S.hasteUntil = now + HASTE.ms;
    if (msg.spell === 'ward') S.wardUntil = now + WARD.ms;
    if (msg.spell === 'broom') { S.broomUntil = now + BROOM.ms; S.broomA = msg.a ?? S.me.a; }
    if (msg.spell === 'invis') S.invisUntil = now + INVIS.ms;
    if (msg.spell === 'blink' && msg.to && S.me) { Object.assign(S.me, msg.to); S.vx = S.vy = S.vz = 0; }
    banner({ broom: 'BROOM DASH', blink: 'BLINK', invis: 'INVISIBLE', curse: 'CURSE CAST' }[msg.spell] || msg.spell.toUpperCase(), true);
  },

  // Capture the Cauldron events: { event: take | drop | return | capture, team (whose cauldron), by }
  cauldron(msg) {
    const whose = teamName('ctf', msg.team) + ' cauldron', who = msg.by != null ? nameOf(msg.by) : '';
    const text = msg.event === 'take' ? `${who} took the ${whose}` : msg.event === 'drop' ? `${who} dropped the ${whose}`
      : msg.event === 'capture' ? `${who} captured the ${whose}!` : `The ${whose} went home`;
    pushNote(text);
    const ours = msg.team === S.myTeam;
    if (msg.event === 'capture') { banner(ours ? 'THEY CAPTURED OUR CAULDRON' : 'CAULDRON CAPTURED!', !ours); play(ours ? 'lose' : 'win'); }
    else if (msg.event === 'take') { banner(ours ? 'OUR CAULDRON IS TAKEN!' : msg.by === S.myId ? 'YOU HAVE THEIR CAULDRON' : 'WE HAVE THEIR CAULDRON', !ours); play('pickup'); }
    else if (msg.event === 'return' && ours) banner('OUR CAULDRON IS HOME', true);
  },

  // the Hex Wand's bolt jumping to a second target
  chain(msg, now) {
    S.tracers.push({ x0: msg.x0, y0: msg.y0, z0: msg.z0, x1: msg.x1, y1: msg.y1, z1: msg.z1, weapon: 'wand', t: now, mine: false });
    burst(msg.x1, msg.y1, msg.z1, 14, 'spark', GUN_COLOR.wand);
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
    if (msg.weapon === 'blade' || msg.weapon === 'claws') playAt('slash', msg.x, msg.y);
    if (msg.who === S.myId) {
      S.hitFlash = 8; play('hurt'); S.shake = Math.max(S.shake, 6);
      if (msg.dmg > 0 && S.me) {
        const other = S.others[msg.by]?.now;
        const fromX = Number.isFinite(msg.fromX) ? msg.fromX : other?.x ?? msg.x;
        const fromY = Number.isFinite(msg.fromY) ? msg.fromY : other?.y ?? msg.y;
        if (Number.isFinite(fromX) && Number.isFinite(fromY)) {
          S.damageIndicators.push({ angle: Math.atan2(fromY - S.me.y, fromX - S.me.x), t: now });
          if (S.damageIndicators.length > 8) S.damageIndicators.shift();
        }
      }
    }
    else       if (S.others[msg.who]) S.others[msg.who].hitT = now;
    if (msg.by === S.myId) {
      S.hitMarker = 18; S.hitHead = msg.head;
      play(msg.head ? 'headshot' : 'hitmarker');
    }
  },

  kill(msg, now) {
    const pit = msg.weapon === 'pit';
    const fling = { sniper: 6, shotgun: 5, blade: 3, pit: 0 }[msg.weapon] ?? 2; // how hard the body gets thrown
    const a = msg.a || 0;
    const victim = S.room && S.room.players.find(p => p.id === msg.victim);
    S.corpses.push({ x: msg.x, y: msg.y, z: msg.z, skin: msg.skin || victim && victim.skin, vx: Math.cos(a) * fling, vy: Math.sin(a) * fling, vz: fling * 0.5 + 1,
      t: now, landed: false, mine: msg.victim === S.myId });
    burst(msg.x, msg.y, msg.z + 0.4, 45, pit ? 'fire' : 'blood');
    burst(msg.x, msg.y, msg.z + 0.4, 25, 'fire');
    if (msg.fx) { burst(msg.x, msg.y, msg.z + 0.4, 60, 'fire', msg.fx); burst(msg.x, msg.y, msg.z + 0.6, 30, 'spark', msg.fx); } // the killer's kill effect
    pushFeed(msg);
    announceStreak(msg);
    if (msg.killer === S.myId) {
      // gun game: the kill hands you the next gun (a stab only knocks them down one)
      const gunLabel = msg.climbed && msg.gunLevel < GUN_GAME_LADDER.length
        ? (gunGameGun(msg.gunLevel) === 'blade' ? 'FINAL: BLADE' : gunGameGun(msg.gunLevel).toUpperCase())
        : msg.demoted !== undefined ? 'HUMILIATED' : '';
      const label = gunLabel || (msg.infected ? 'INFECTED' : msg.backstab ? 'BACKSTAB' : msg.head ? 'HEADSHOT' : 'KILL');
      banner(label + (msg.weapon === 'sniper' && !gunLabel ? '  ' + msg.dist.toFixed(1) + 'm' : ''), msg.head || msg.backstab || !!gunLabel);
      S.myStreak = msg.streak || 0;
      const call = MULTI_NAMES[Math.min(5, msg.multi || 0)] || STREAK_NAMES[msg.streak] || (msg.ended ? 'SHUT DOWN' : '');
      if (call) { callout(call); play('streak'); }
      play('kill');
      if (msg.backstab) play('backstab');
      if (msg.weapon === 'sniper') S.killFlash = 10;
      if (S.theme.id === 'witch') setTimeout(() => play('cackle'), 250);
    } else if (msg.victim === S.myId) {
      S.myStreak = 0;
      if (msg.respawnMs !== 0) enterSpectate(msg.killer, msg.respawnMs, msg.weapon);
      if (msg.demoted !== undefined) callout('STABBED: DOWN TO ' + gunGameGun(msg.demoted).toUpperCase());
      if (msg.infected) {
        S.myTeam = PLAGUE_TEAM;
        banner('YOU ARE INFECTED', true);
      }
      showMsg(msg.infected ? 'You joined the plague!' : pit ? S.theme.pitDeath : msg.weapon === 'zone' ? 'The storm took you'
        : (msg.backstab ? 'Backstabbed by ' : 'Killed by ') + nameOf(msg.killer));
      play(pit ? 'burn' : 'death');
    } else playAt(pit ? 'burn' : 'death', msg.x, msg.y);
  },

  // { winner: id } in free-for-all, { team } in teams or plague; scores = final board
  win(msg) {
    const mode = msg.mode || S.room?.mode;
    const won = msg.team ? msg.team === S.myTeam : msg.winner === S.myId;
    let headline, sys, rematch;
    if (mode === 'plague' && msg.team) {
      const plagueWon = msg.team === PLAGUE_TEAM;
      headline = plagueWon ? 'PLAGUE WINS!' : 'SURVIVORS WIN!';
      sys = plagueWon ? 'Plague wins' : 'Survivors win';
      rematch = (plagueWon ? 'Plague' : 'Survivors') + ' won. Rematch?';
    } else {
      const who = msg.team ? teamName(mode, msg.team) + ' TEAM' : nameOf(msg.winner).toUpperCase();
      headline = won ? (msg.team ? 'YOUR TEAM WINS!' : mode === 'royale' ? 'LAST ONE STANDING!' : 'YOU WIN!') : who + ' WINS!';
      sys = won ? (msg.team ? 'Your team wins!' : 'You win!') : who + ' wins';
      rematch = won ? 'You won! Rematch?' : who.toLowerCase().replace(/^\w/, c => c.toUpperCase()) + ' won. Rematch?';
    }
    play(won ? 'win' : 'lose');
    addSystem(sys);
    S.started = false;
    leaveSpectate();
    const scores = (msg.scores || []).map(r => ({
      ...r,
      winner: msg.team ? r.team === msg.team : r.id === msg.winner,
    }));
    showSummary({
      headline, rematch, scores, mode, level: msg.level || S.room?.level, won,
      hardpointScores: msg.hardpointScores, ctfScores: msg.ctfScores,
    });
  },

  // the match stopped early (not enough players left)
  end(msg) {
    S.started = false;
    leaveSpectate();
    addSystem(msg.reason || 'Match ended');
    if (msg.scores && msg.scores.length) {
      showSummary({
        headline: 'MATCH ENDED',
        rematch: msg.reason || 'Match ended',
        scores: msg.scores,
        mode: msg.mode || S.room?.mode,
        level: msg.level || S.room?.level,
        won: false,
        hardpointScores: msg.hardpointScores,
        ctfScores: msg.ctfScores,
      });
    } else showWait(msg.reason);
  },

  notice(msg) { toast(msg.text); },

  // display-name easter egg: server turns cheats on/off
  hacks(msg) {
    S.hacks = !!msg.on;
    const el = document.getElementById('hackBadge');
    if (el) el.hidden = !S.hacks;
  },

  chat(msg) { addChat(msg); },
  dm(msg) { addDm(msg); },
  rtc(msg) { onSignal(msg); },

  profile(msg) { showProfile(msg); },
  party(msg) { showParty(msg); },
  partyInvite(msg) { showPartyInvite(msg); },
  partyMove(msg) { toast('Following your party leader…'); goToRoom(msg.room); },
  meta(msg) { showMeta(msg); },
  challenge(msg) {
    const text = `Challenge complete: ${msg.text} (+${msg.xp} XP)`;
    if (S.started) banner('✓ ' + msg.text.toUpperCase(), true); else toast(text);
    addSystem(text);
  },
  settings(msg) { fromProfile(msg.settings); },
  auth(msg) { onAuth(msg); },
  leaderboard(msg) { showBoard(msg.rows); },
  friends(msg) { showFriends(msg.list); },
  invite(msg) { showInvite(msg); },
};
