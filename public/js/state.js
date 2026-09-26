// All mutable client state lives on this one object so every module sees the same values.
import { BASE_FOV } from './constants.js';

export const S = {
  // connection / match
  myId: null, started: false, myKills: 0, myTeam: 0,
  // the room from the server: { code, private, mode, level, gameOn, bots, max, players: [{ id, name, team, ready, bot }] }
  room: null,

  // you: position is client-authoritative; seq changes when the server respawns you
  me: null, mySeq: 0, pitch: 0,
  vx: 0, vy: 0, vz: 0, onGround: true, speed: 0, bobPhase: 0, stepAcc: 0,

  // weapons + input
  inv: {}, weapon: 'rifle', scoped: false, switchUntil: 0, mouseHeld: false,
  nextFire: { rifle: 0, sniper: 0, shotgun: 0, smg: 0, blade: 0 },
  keys: {}, mouseDX: 0, mouseDY: 0,

  // everyone else: id -> { prev, cur, t, now, step, flashT, hitT }. Drawn one server tick
  // behind, interpolated from prev to cur (`now` is this frame's position)
  others: {},
  feed: [], // kill feed: { killer, victim, weapon, head, backstab, mine, t }

  // current level (see level.js)
  level: null, MAP: null, T: null, theme: null, pickupSpots: [], pickupActive: [],

  // screen effects
  hitFlash: 0, healFlash: 0, killFlash: 0, muzzle: 0, recoil: 0, hitMarker: 0, hitHead: false,
  punch: 0, shake: 0, fovKick: 0, fireT: -1e9, swingT: -1e9, quickUntil: 0,
  bannerText: '', bannerT: -1e9, bannerGold: false,

  // world effects
  fov: BASE_FOV, tracers: [], particles: [], corpses: [], embers: [],
  cam: null, // camera for the current frame, set by render/index.js
};

export const owned = w => w === 'rifle' || w === 'blade' || S.inv[w] > 0;

// roster lookups
export const playerInfo = id => (S.room && S.room.players.find(p => p.id === id)) || null;
export const nameOf = id => id === S.myId ? 'You' : (playerInfo(id) || { name: '?' }).name;
export const teamOf = id => id === S.myId ? S.myTeam : (playerInfo(id) || { team: 0 }).team;
export const isEnemy = id => !S.room || S.room.mode !== 'teams' || teamOf(id) !== S.myTeam;
