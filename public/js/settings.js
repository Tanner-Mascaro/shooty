// Player settings (FPS cap, sensitivity, key bindings), saved in this browser, and the
// settings panel. Keys are KeyboardEvent.code values ('KeyW', 'Space', 'Digit1'), so they
// don't change with Shift or the keyboard layout.
import { S } from './state.js';

const $ = id => document.getElementById(id);

// action -> [label, default key]; order is the order in the panel
export const ACTIONS = {
  forward: ['Move forward', 'KeyW'], back: ['Move back', 'KeyS'], left: ['Strafe left', 'KeyA'], right: ['Strafe right', 'KeyD'],
  jump: ['Jump', 'Space'], reload: ['Reload', 'KeyR'], swap: ['Swap to last gun', 'KeyQ'], next: ['Next gun', 'KeyE'],
  melee: ['Quick melee', 'KeyF'], slot1: ['Rifle', 'Digit1'], slot2: ['Sniper', 'Digit2'], slot3: ['Shotgun', 'Digit3'],
  slot4: ['SMG', 'Digit4'], slot5: ['Blade', 'Digit5'], fullscreen: ['Fullscreen', 'KeyO'],
};
const DEFAULTS = { fps: 0, showFps: false, sens: 1, keys: Object.fromEntries(Object.entries(ACTIONS).map(([a, [, k]]) => [a, k])) };
const FPS_CHOICES = [0, 30, 60, 90, 120, 144, 165, 240]; // 0 = as fast as the display refreshes

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem('settings')) || {};
    return { ...DEFAULTS, ...saved, keys: { ...DEFAULTS.keys, ...saved.keys } };
  } catch { return structuredClone(DEFAULTS); }
}
export const settings = load();
function save() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch {}
  showControlsHint();
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
    `${k('reload')} reload | ${k('swap')} last gun | ${k('next')}/wheel next gun | ${k('slot1')}-${k('slot5')} slots | ${k('melee')} melee | ${k('fullscreen')} fullscreen`;
}

export function initSettings() {
  $('fpsCap').replaceChildren(...FPS_CHOICES.map(n => new Option(n ? n + ' FPS' : 'Unlimited (display refresh)', n)));
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
