// All mutable client state lives on this one object so every module sees the same values.
import { BASE_FOV } from './constants.js';
import { isTeamMode } from '/shared/config.js';

export const S = {
  // connection / match
  myId: null, started: false, myKills: 0, myTeam: 0, hacks: false,
  plagueEndsAt: 0, // estimated local deadline from the server's remaining time
  hardpoint: null, // latest authoritative hill, team score and match-clock snapshot
  // battle royale storm from the server: { x, y, r, nx, ny, nr, stage, stages, shrinking, ms, alive };
  // zoneEndsAt is the local time its current hold / shrink ends
  zone: null, zoneEndsAt: 0,
  myStreak: 0, myGunLevel: 0, // kills since you last died; your gun game rung
  // the room from the server: { code, private, mode, level, gameOn, bots, max, players: [{ id, name, team, ready, bot }] }
  room: null,
  xp: 0, // your saved XP (levels and skin unlocks: shared/progression.js); xpStart: what it was when the match began
  xpStart: null,

  // you: position is client-authoritative; seq changes when the server respawns you
  me: null, mySeq: 0, pitch: 0,
  // dead: the camera watches spectateId (or where you fell) until respawnAt (null: not this match)
  dead: false, spectateId: null, respawnAt: 0, deathAt: null, specCam: null,
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
  // spells: mana from the server, stored spells (up to SPELL_SLOTS), build mode (gun holstered,
  // clicks place ramps), and how long haste / ward last (local clock)
  mana: 100, spells: [], buildMode: false, hasteUntil: 0, wardUntil: 0,
  builds: new Map(), // conjured ramps: id -> { kind, x, y, dir, base, on, prev }
  nextFire: { pistol: 0, deagle: 0, revolver: 0, rifle: 0, burst: 0, carbine: 0, sniper: 0, crossbow: 0, beam: 0, shotgun: 0, smg: 0, uzi: 0, lmg: 0, blade: 0, claws: 0 },
  keys: {}, mouseDX: 0, mouseDY: 0,
  // touch screens (touch.js): the joystick's analog walk (x strafe, y forward, -1..1) and where the hotbar slots are
  touch: false, touchMove: { x: 0, y: 0 }, hotbarHits: [],
  padMove: { x: 0, y: 0 },
  killcam: null, // { id, weapon, until }: the moment after you die, seen over your killer's shoulder (spectate.js)
  tutorialDone: false, // a game controller's left stick (gamepad.js), same idea

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
  hitFlash: 0, healFlash: 0, killFlash: 0, muzzle: 0, recoil: 0, hitMarker: 0, hitHead: false, damageIndicators: [],
  punch: 0, shake: 0, fovKick: 0, swayX: 0, swayY: 0, fireT: -1e9, swingT: -1e9, quickUntil: 0,
  bannerText: '', bannerT: -1e9, bannerGold: false,
  calloutText: '', calloutT: -1e9, // streak / multi-kill line under the banner

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
