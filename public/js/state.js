// All mutable client state lives on this one object so every module sees the same values.
import { BASE_FOV } from './constants.js';
import { isTeamMode } from '/shared/config.js';

export const S = {
  // connection / match
  myId: null, started: false, myKills: 0, myTeam: 0,
  plagueEndsAt: 0, // estimated local deadline from the server's remaining time
  // the room from the server: { code, private, mode, level, gameOn, bots, max, players: [{ id, name, team, ready, bot }] }
  room: null,

  // you: position is client-authoritative; seq changes when the server respawns you
  me: null, mySeq: 0, pitch: 0,
  vx: 0, vy: 0, vz: 0, onGround: true, speed: 0, bobPhase: 0, stepAcc: 0,
  // sliding: slideEnd while it lasts, slideReady after its cooldown; slideArmed is set by a fresh
  // key press (so holding the key through a landing slides once); slideDip eases the camera down
  sliding: false, slideEnd: 0, slideReady: 0, slideArmed: false, slideDip: 0,

  // weapons + input
  // mag: rounds loaded per gun you own; inv: spare rounds per gun (the server sends the real
  // loadout on spawn)
  mag: { pistol: 12 }, inv: { pistol: 24 }, nades: 0, weapon: 'pistol', lastWeapon: 'blade', scoped: false, switchUntil: 0, mouseHeld: false,
  clawsOnly: false, jumpsUsed: 0, jumpHeld: false,
  dashX: 0, dashY: 0, dashUntil: 0, nextDash: 0,
  reloading: null, // { w, start, until } while a reload runs
  nextFire: { pistol: 0, deagle: 0, revolver: 0, rifle: 0, burst: 0, carbine: 0, sniper: 0, crossbow: 0, shotgun: 0, smg: 0, uzi: 0, lmg: 0, blade: 0, claws: 0 },
  keys: {}, mouseDX: 0, mouseDY: 0,

  // everyone else: id -> { prev, cur, t, now, step, flashT, hitT }. Drawn one server tick
  // behind, interpolated from prev to cur (`now` is this frame's position)
  others: {},
  feed: [], // kill feed: { killer, victim, weapon, head, backstab, mine, t }
  thrown: [], // grenades in flight from the server: { id, x, y, z }

  // current level (see level.js)
  level: null, MAP: null, T: null, theme: null, pickupSpots: [], pickupActive: [],
  boxes: [], // loot boxes on the ground: { id, x, y, z, items: [weapon] }
  useTarget: null, // what the use key would pick up right now (see weapons.js findUseTarget)
  aimHeld: false, // right mouse button is down

  // screen effects
  hitFlash: 0, healFlash: 0, killFlash: 0, muzzle: 0, recoil: 0, hitMarker: 0, hitHead: false,
  punch: 0, shake: 0, fovKick: 0, swayX: 0, swayY: 0, fireT: -1e9, swingT: -1e9, quickUntil: 0,
  bannerText: '', bannerT: -1e9, bannerGold: false,

  // world effects
  fov: BASE_FOV, tracers: [], particles: [], corpses: [], embers: [],
  cam: null, // camera for the current frame, set by render/index.js
};

export const owned = w => S.clawsOnly ? w === 'claws' : w === 'blade' || S.mag[w] !== undefined;
export const spare = w => S.inv[w] || 0;
export const gunSlots = () => Object.keys(S.mag); // your guns in slot order (at most GUN_SLOTS)

// roster lookups
export const playerInfo = id => (S.room && S.room.players.find(p => p.id === id)) || null;
export const nameOf = id => id === S.myId ? 'You' : (playerInfo(id) || { name: '?' }).name;
export const teamOf = id => id === S.myId ? S.myTeam : (playerInfo(id) || { team: 0 }).team;
export const isEnemy = id => !S.room || !isTeamMode(S.room.mode) || teamOf(id) !== S.myTeam;
