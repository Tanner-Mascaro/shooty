// All mutable client state lives on this one object so every module sees the same values.
import { BASE_FOV } from './constants.js';

export const S = {
  // connection / match
  myId: null, started: false, myKills: 0,

  // you: position is client-authoritative; seq changes when the server respawns you
  me: null, mySeq: 0, pitch: 0,
  vx: 0, vy: 0, vz: 0, onGround: true, speed: 0, bobPhase: 0, stepAcc: 0,

  // weapons + input
  inv: {}, weapon: 'rifle', scoped: false, switchUntil: 0, mouseHeld: false,
  nextFire: { rifle: 0, sniper: 0, shotgun: 0, smg: 0, blade: 0 },
  keys: {}, mouseDX: 0, mouseDY: 0,

  // enemy, interpolated between the last two server states
  ePrev: null, eCur: null, eTime: 0, enemy: null, enemyStep: 0,
  enemyFlashT: -1e9, enemyHitT: -1e9,

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
