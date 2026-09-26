// Player settings (FPS cap, sound, sensitivity, aim mode, key bindings) and the settings panel.
// Saved in this browser and on your profile, so signing in on another device brings them along
// (the server sends the profile's copy on connect; see hub.js useProfile). Keys are
// KeyboardEvent.code values ('KeyW', 'Space', 'Digit1'), so they don't change with Shift or the
// keyboard layout.
import { S } from './state.js';
import { send } from './net.js';
import { applyVolume } from './audio.js';

const $ = id => document.getElementById(id);

// action -> [label, default key]; order is the order in the panel
export const ACTIONS = {
  forward: ['Move forward', 'KeyW'], back: ['Move back', 'KeyS'], left: ['Strafe left', 'KeyA'], right: ['Strafe right', 'KeyD'],
  jump: ['Jump', 'Space'], reload: ['Reload', 'KeyR'], use: ['Pick up / loot', 'KeyE'], swap: ['Swap to last weapon', 'KeyQ'],
  melee: ['Quick melee', 'KeyF'], slot1: ['Gun 1', 'Digit1'], slot2: ['Gun 2', 'Digit2'], slot3: ['Blade', 'Digit3'],
  fullscreen: ['Fullscreen', 'KeyO'],
};
// ads: right click scopes while held ('hold') or until clicked again ('toggle')
const DEFAULTS = { fps: 0, showFps: false, volume: 1, ambient: 1, sens: 1, ads: 'toggle', keys: Object.fromEntries(Object.entries(ACTIONS).map(([a, [, k]]) => [a, k])) };
const FPS_CHOICES = [0, 30, 60, 90, 120, 144, 165, 240]; // 0 = as fast as the display refreshes

// a full, valid settings object from whatever was saved (older versions, another device)
function normalize(saved) {
  saved = saved && typeof saved === 'object' ? saved : {};
  const num = (v, lo, hi, d) => typeof v === 'number' && v >= lo && v <= hi ? v : d;
  const mine = saved.keys && typeof saved.keys === 'object' ? saved.keys : {}, keys = {};
  // keep bindings for actions that still exist; a new action whose default key you already
  // use for something else starts unbound
  for (const a in ACTIONS) keys[a] = a in mine ? (typeof mine[a] === 'string' ? mine[a] : null)
    : Object.keys(ACTIONS).some(o => mine[o] === DEFAULTS.keys[a]) ? null : DEFAULTS.keys[a];
  return {
    fps: FPS_CHOICES.includes(saved.fps) ? saved.fps : DEFAULTS.fps,
    showFps: typeof saved.showFps === 'boolean' ? saved.showFps : DEFAULTS.showFps,
    volume: num(saved.volume, 0, 1, DEFAULTS.volume), ambient: num(saved.ambient, 0, 1, DEFAULTS.ambient),
    sens: num(saved.sens, 0.2, 3, DEFAULTS.sens),
    ads: ['toggle', 'hold'].includes(saved.ads) ? saved.ads : DEFAULTS.ads,
    keys,
  };
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem('settings'))); } catch { return normalize(null); }
}
export const settings = load();

let upload = null;
function save() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch {}
  showControlsHint();
  applyVolume();
  clearTimeout(upload); // sliders fire a lot: send the profile copy once they settle
  upload = setTimeout(() => send({ type: 'settings', settings }), 800);
}

// the profile's copy, sent by the server when you connect or sign in; null if the profile has
// none yet, so it gets this browser's
export function fromProfile(saved) {
  if (!saved) { send({ type: 'settings', settings }); return; }
  Object.assign(settings, normalize(saved));
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch {}
  showControlsHint();
  applyVolume();
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
  } else if (e.code === 'Escape') closeSettings();
  return true;
}

function render() {
  $('fpsCap').value = settings.fps;
  $('showFps').checked = settings.showFps;
  $('sens').value = settings.sens;
  $('ads').value = settings.ads;
  for (const k of ['volume', 'ambient']) { $(k).value = settings[k]; $(k + 'Val').textContent = Math.round(settings[k] * 100) + '%'; }
  $('sensVal').textContent = settings.sens.toFixed(2) + '×';
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
function showControlsHint() {
  const k = a => keyName(settings.keys[a]);
  $('controls').textContent = `${k('forward')}${k('left')}${k('back')}${k('right')} move | mouse aim | ${k('jump')} jump (hold to bhop) | click shoot | right click scope | ` +
    `${k('reload')} reload | ${k('use')} pick up / loot | ${k('swap')}/wheel switch | ${k('slot1')} ${k('slot2')} guns ${k('slot3')} blade | ${k('melee')} melee | ${k('fullscreen')} fullscreen`;
}

export function initSettings() {
  $('fpsCap').replaceChildren(...FPS_CHOICES.map(n => new Option(n ? n + ' FPS' : 'Unlimited (display refresh)', n)));
  $('ads').addEventListener('change', e => { settings.ads = e.target.value; save(); });
  for (const k of ['volume', 'ambient'])
    $(k).addEventListener('input', e => { settings[k] = +e.target.value; $(k + 'Val').textContent = Math.round(settings[k] * 100) + '%'; save(); });
  $('fpsCap').addEventListener('change', e => { settings.fps = +e.target.value; save(); });
  $('showFps').addEventListener('change', e => { settings.showFps = e.target.checked; save(); });
  $('sens').addEventListener('input', e => { settings.sens = +e.target.value; $('sensVal').textContent = settings.sens.toFixed(2) + '×'; save(); });
  document.querySelectorAll('#fsBtn, .fsToggle').forEach(b => b.addEventListener('click', toggleFullscreen));
  $('resetBinds').addEventListener('click', () => { settings.keys = { ...DEFAULTS.keys }; save(); render(); });
  $('closeSettings').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', e => { if (e.target.id === 'settings') closeSettings(); }); // click outside the panel
  document.querySelectorAll('.gear').forEach(b => b.addEventListener('click', openSettings));
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fs', !!document.fullscreenElement);
    document.querySelectorAll('.fsToggle').forEach(b => b.textContent = document.fullscreenElement ? '⛶ Exit fullscreen' : '⛶ Fullscreen');
    if (settingsOpen()) render();
  });
  showControlsHint();
}
