// Player settings (FPS cap, sound, sensitivity, aim mode, key bindings) and the settings panel.
// Saved in this browser and on your profile, so signing in on another device brings them along
// (the server sends the profile's copy on connect; see hub.js useProfile). Keys are
// KeyboardEvent.code values ('KeyW', 'Space', 'Digit1'), so they don't change with Shift or the
// keyboard layout.
import { S } from './state.js';
import { send } from './net.js';
import { applyVolume } from './audio.js';
import { applyVolume as applyVoiceVolume, syncVoice, askMic } from './voice.js';
import { refreshChat } from './chat.js';

const $ = id => document.getElementById(id);

// action -> [label, default key]; order is the order in the panel
export const ACTIONS = {
  forward: ['Move forward', 'KeyW'], back: ['Move back', 'KeyS'], left: ['Strafe left', 'KeyA'], right: ['Strafe right', 'KeyD'],
  jump: ['Jump', 'Space'], slide: ['Slide / infected dash', 'ShiftLeft'], reload: ['Reload', 'KeyR'], use: ['Pick up / loot', 'KeyE'], swap: ['Swap to last weapon', 'KeyQ'],
  melee: ['Quick melee', 'KeyF'], nade: ['Throw potion', 'KeyG'],
  slot1: ['Gun 1', 'Digit1'], slot2: ['Gun 2', 'Digit2'], slot3: ['Blade', 'Digit3'],
  respawn: ['Respawn if stuck', 'KeyK'],
  chat: ['Open messages', 'Enter'], talk: ['Push to talk', 'KeyV'],
  fullscreen: ['Fullscreen', 'KeyO'], settings: ['Open settings', 'KeyP'],
  build: ['Build mode (Earth Ramp)', 'KeyX'],
  spell1: ['Spell 1', 'Digit4'], spell2: ['Spell 2', 'Digit5'], spell3: ['Spell 3', 'Digit6'],
};
// ads: right click scopes while held ('hold') or until clicked again ('toggle');
// voice: 'ptt' (push to talk), 'open' (open mic) or 'off' (no voice chat at all)
const DEFAULTS = {
  fps: 0, showFps: false, fov: 1, crosshair: 1, showMinimap: true, showFeed: true, displayTheme: 'light',
  volume: 1, sfx: 1, ambient: 1, voice: 'ptt', voiceVol: 1, sens: 1, invertY: false, ads: 'toggle',
  keys: Object.fromEntries(Object.entries(ACTIONS).map(([a, [, k]]) => [a, k])),
};
const FPS_CHOICES = [0, 30, 60, 90, 120, 144, 165, 240]; // 0 = as fast as the display refreshes

// a full, valid settings object from whatever was saved (older versions, another device)
function normalize(saved) {
  saved = saved && typeof saved === 'object' ? saved : {};
  const num = (v, lo, hi, d) => typeof v === 'number' && v >= lo && v <= hi ? v : d;
  const mine = saved.keys && typeof saved.keys === 'object' ? { ...saved.keys } : {}, keys = {};
  if (!('slide' in mine) && 'dash' in mine) mine.slide = mine.dash; // preserve the previous infected dash binding
  // keep bindings for actions that still exist; a new action whose default key you already
  // use for something else starts unbound
  for (const a in ACTIONS) keys[a] = a in mine ? (typeof mine[a] === 'string' ? mine[a] : null)
    : Object.keys(ACTIONS).some(o => mine[o] === DEFAULTS.keys[a]) ? null : DEFAULTS.keys[a];
  return {
    fps: FPS_CHOICES.includes(saved.fps) ? saved.fps : DEFAULTS.fps,
    showFps: typeof saved.showFps === 'boolean' ? saved.showFps : DEFAULTS.showFps,
    fov: num(saved.fov, 0.75, 1.35, DEFAULTS.fov),
    crosshair: num(saved.crosshair, 0.6, 1.8, DEFAULTS.crosshair),
    showMinimap: typeof saved.showMinimap === 'boolean' ? saved.showMinimap : DEFAULTS.showMinimap,
    showFeed: typeof saved.showFeed === 'boolean' ? saved.showFeed : DEFAULTS.showFeed,
    displayTheme: ['light', 'dark', 'system'].includes(saved.displayTheme) ? saved.displayTheme : DEFAULTS.displayTheme,
    volume: num(saved.volume, 0, 1, DEFAULTS.volume), sfx: num(saved.sfx, 0, 1, DEFAULTS.sfx),
    ambient: num(saved.ambient, 0, 1, DEFAULTS.ambient),
    sens: num(saved.sens, 0.2, 3, DEFAULTS.sens),
    invertY: typeof saved.invertY === 'boolean' ? saved.invertY : DEFAULTS.invertY,
    ads: ['toggle', 'hold'].includes(saved.ads) ? saved.ads : DEFAULTS.ads,
    voice: ['ptt', 'open', 'off'].includes(saved.voice) ? saved.voice : DEFAULTS.voice,
    voiceVol: num(saved.voiceVol, 0, 1, DEFAULTS.voiceVol),
    keys,
  };
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem('settings'))); } catch { return normalize(null); }
}
export const settings = load();

const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
function applyDisplayTheme() {
  const dark = settings.displayTheme === 'dark' || (settings.displayTheme === 'system' && systemTheme?.matches);
  document.body.classList.toggle('display-dark', !!dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#080a0e' : '#12100e');
}
applyDisplayTheme();
systemTheme?.addEventListener('change', () => {
  if (settings.displayTheme === 'system') applyDisplayTheme();
});

let upload = null;
function save() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch {}
  applyDisplayTheme();
  showControlsHint();
  applyVolume(); applyVoiceVolume(); refreshChat();
  clearTimeout(upload); // sliders fire a lot: send the profile copy once they settle
  upload = setTimeout(() => send({ type: 'settings', settings }), 800);
}

// the profile's copy, sent by the server when you connect or sign in; null if the profile has
// none yet, so it gets this browser's
export function fromProfile(saved) {
  if (!saved) { send({ type: 'settings', settings }); return; }
  Object.assign(settings, normalize(saved));
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch {}
  applyDisplayTheme();
  showControlsHint();
  applyVolume(); applyVoiceVolume(); syncVoice(); refreshChat();
  if (settingsOpen()) render();
}

export const held = action => !!S.keys[settings.keys[action]];
export const actionFor = code => Object.keys(settings.keys).find(a => settings.keys[a] === code);

export function keyName(code) {
  if (!code) return '—';
  const special = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'CAPS', ArrowUp: '↑',
    ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return special[code] || code.replace(/^(Key|Digit|Numpad)/, '').toUpperCase();
}

// --- fullscreen: the whole screen is the game, no browser tabs or bars ---
export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// --- panel ---
let binding = null; // action waiting for a key press

export const settingsOpen = () => !$('settings').hidden;

export function openSettings() {
  if (document.pointerLockElement) document.exitPointerLock();
  render();
  $('settings').hidden = false;
}
function closeSettings() { binding = null; $('settings').hidden = true; }

// called first on every keydown; true if the panel used the key (so the game ignores it)
export function captureKey(e) {
  if (!settingsOpen()) return false;
  if (binding) {
    e.preventDefault();
    if (e.code !== 'Escape') {
      const old = settings.keys[binding], other = actionFor(e.code);
      if (other && other !== binding) settings.keys[other] = old; // the key was taken: trade places
      settings.keys[binding] = e.code;
      save();
    }
    binding = null;
    render();
  } else if (e.code === 'Escape' || e.code === settings.keys.settings) closeSettings();
  return true;
}

function render() {
  $('fpsCap').value = settings.fps;
  $('showFps').checked = settings.showFps;
  $('fov').value = settings.fov;
  $('crosshair').value = settings.crosshair;
  $('showMinimap').checked = settings.showMinimap;
  $('showFeed').checked = settings.showFeed;
  $('displayTheme').value = settings.displayTheme;
  $('sens').value = settings.sens;
  $('invertY').checked = settings.invertY;
  $('ads').value = settings.ads;
  $('voiceMode').value = settings.voice;
  for (const k of ['volume', 'sfx', 'ambient', 'voiceVol']) { $(k).value = settings[k]; $(k + 'Val').textContent = Math.round(settings[k] * 100) + '%'; }
  $('sensVal').textContent = settings.sens.toFixed(2) + '×';
  $('fovVal').textContent = Math.round(settings.fov * 100) + '%';
  $('crosshairVal').textContent = settings.crosshair.toFixed(1) + '×';
  $('fsBtn').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Go fullscreen';
  $('binds').replaceChildren(...Object.entries(ACTIONS).map(([a, [label]]) => {
    const row = document.createElement('li'), name = document.createElement('span'), key = document.createElement('button');
    name.textContent = label;
    key.textContent = binding === a ? 'Press a key…' : keyName(settings.keys[a]);
    key.classList.toggle('waiting', binding === a);
    key.addEventListener('click', () => { binding = binding === a ? null : a; render(); });
    row.append(name, key);
    return row;
  }));
}

// the hint line at the bottom of the screen, using your keys
export function showControlsHint() {
  const k = a => keyName(settings.keys[a]);
  const el = $('controlsHint') || $('controls');
  if (S.clawsOnly) {
    el.textContent = `${k('forward')}${k('left')}${k('back')}${k('right')} move | mouse aim | ${k('jump')} jump, press again for double jump | ${k('slide')} dash | hold left click attack | ${k('fullscreen')} fullscreen`;
    return;
  }
  el.textContent = `${k('forward')}${k('left')}${k('back')}${k('right')} move | mouse aim | ${k('jump')} jump (hold to bhop) | ${k('slide')} slide | click shoot | right click scope | ` +
    `${k('reload')} reload | ${k('use')} pick up / loot | ${k('nade')} potion | ${k('swap')}/wheel switch | ${k('slot1')} ${k('slot2')} guns ${k('slot3')} blade | ${k('melee')} melee | ${k('build')} build mode | ${k('spell1')}-${k('spell3')} spells | ${k('chat')} messages | ${k('talk')} talk | ${k('fullscreen')} fullscreen | ${k('settings')} settings`;
}

export function initSettings() {
  $('fpsCap').replaceChildren(...FPS_CHOICES.map(n => new Option(n ? n + ' FPS' : 'Unlimited (display refresh)', n)));
  $('ads').addEventListener('change', e => { settings.ads = e.target.value; save(); });
  $('voiceMode').addEventListener('change', e => {
    settings.voice = e.target.value; save(); syncVoice();
    if (settings.voice === 'open') askMic(); // this change is a click: the browser may ask now
  });
  for (const k of ['volume', 'sfx', 'ambient', 'voiceVol'])
    $(k).addEventListener('input', e => { settings[k] = +e.target.value; $(k + 'Val').textContent = Math.round(settings[k] * 100) + '%'; save(); });
  $('fpsCap').addEventListener('change', e => { settings.fps = +e.target.value; save(); });
  $('showFps').addEventListener('change', e => { settings.showFps = e.target.checked; save(); });
  $('showMinimap').addEventListener('change', e => { settings.showMinimap = e.target.checked; save(); });
  $('showFeed').addEventListener('change', e => { settings.showFeed = e.target.checked; save(); });
  $('displayTheme').addEventListener('change', e => { settings.displayTheme = e.target.value; save(); });
  $('invertY').addEventListener('change', e => { settings.invertY = e.target.checked; save(); });
  $('sens').addEventListener('input', e => { settings.sens = +e.target.value; $('sensVal').textContent = settings.sens.toFixed(2) + '×'; save(); });
  $('fov').addEventListener('input', e => { settings.fov = +e.target.value; $('fovVal').textContent = Math.round(settings.fov * 100) + '%'; save(); });
  $('crosshair').addEventListener('input', e => { settings.crosshair = +e.target.value; $('crosshairVal').textContent = settings.crosshair.toFixed(1) + '×'; save(); });
  document.querySelectorAll('#fsBtn, .fsToggle').forEach(b => b.addEventListener('click', toggleFullscreen));
  $('resetBinds').addEventListener('click', () => { settings.keys = { ...DEFAULTS.keys }; save(); render(); });
  $('closeSettings').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', e => { if (e.target.id === 'settings') closeSettings(); }); // click outside the panel
  document.querySelectorAll('.gear').forEach(b => b.addEventListener('click', openSettings));
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fs', !!document.fullscreenElement);
    document.querySelectorAll('.fsToggle').forEach(b => b.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen');
    if (settingsOpen()) render();
  });
  showControlsHint();
}
