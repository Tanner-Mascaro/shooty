// First screen: sign in (or play as guest) and pick how to start — vs bots, quick play, or private room.
// Shown when you open the site with no ?room= / ?play=. Invite links and play links skip to the lobby.
// Bare / does not join a match room, so the menu can't shove you into a public lobby.
import { send } from './net.js';
import { token, setToken, clearToken, savedName, saveName, savedSkin } from './profile.js';
import { goToRoom, newCode } from './room.js';
import { initAudio } from './audio.js';

const $ = id => document.getElementById(id);

// true while the home screen is covering the lobby
export const homeOpen = () => !$('home').hidden;

export function hideHome() {
  $('home').hidden = true;
  document.body.classList.remove('on-home');
}

function showHome() {
  $('home').hidden = false;
  document.body.classList.add('on-home');
  syncHomeAuth(true);
}

let signedIn = false;
let authLayout = null; // 'in' | 'form' | 'guest' — only rewrite the DOM when this changes

export function homeProfile(msg) {
  const next = !!msg.username;
  if (next === signedIn && homeOpen()) {
    // soft update: welcome text / name only, don't flip panels (that jumps the layout)
    if (signedIn) $('homeWelcome').textContent = 'Signed in as ' + (savedName() || msg.name || 'you');
    if (document.activeElement !== $('homeName') && savedName()) $('homeName').value = savedName();
    return;
  }
  signedIn = next;
  syncHomeAuth(true);
}

function setAuthLayout(mode) {
  if (authLayout === mode) return;
  authLayout = mode;
  $('homeSigned').hidden = mode !== 'in';
  $('homeAuth').hidden = mode !== 'form';
  $('homeGuest').hidden = mode !== 'guest';
}

function syncHomeAuth(force) {
  if (!homeOpen()) return;
  const name = savedName();
  if (force || document.activeElement !== $('homeName')) {
    $('homeName').value = name;
    $('homeName').placeholder = name || 'Your name';
  }
  if (signedIn) {
    setAuthLayout('in');
    $('homeWelcome').textContent = 'Signed in as ' + (name || 'you');
    $('homeGuest').dataset.skipped = '';
  } else if ($('homeGuest').dataset.skipped === '1') setAuthLayout('guest');
  else setAuthLayout('form');
}

export function homeAuth(msg) {
  if (!homeOpen()) return;
  if (msg.error) { $('homeAuthErr').textContent = msg.error; return; }
  $('homePass').value = '';
  $('homeAuthErr').textContent = '';
  if (msg.token) setToken(msg.token);
  if (msg.signedOut) {
    clearToken(); saveName('');
    signedIn = false;
    authLayout = null;
    send({ type: 'hello', token: token(), name: '', skin: 'demon' });
  }
  // profile message that follows will call homeProfile; don't thrash the layout here
}

function saveGuestName() {
  const name = $('homeName').value.trim();
  if (name) { saveName(name); send({ type: 'hello', token: token(), name, skin: savedSkin() }); }
}

function botLevel() {
  return document.querySelector('#homeBotLevel button.sel')?.dataset.level || 'medium';
}

function playVsBots() {
  initAudio();
  saveGuestName();
  try {
    sessionStorage.setItem('shooty.fillBots', botLevel());
    sessionStorage.setItem('shooty.autoReady', '1');
  } catch {}
  goToRoom(newCode());
}

function quickPlay() {
  initAudio();
  saveGuestName();
  location.href = '?play=1';
}

function privateRoom() {
  initAudio();
  saveGuestName();
  goToRoom(newCode());
}

export function initHome() {
  const q = new URLSearchParams(location.search);
  const hasRoom = !!q.get('room') || q.get('play') === '1';
  if (hasRoom) { hideHome(); return; }
  showHome();

  document.querySelectorAll('#homeBotLevel button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#homeBotLevel button').forEach(x => x.classList.toggle('sel', x === b));
  }));
  document.querySelector('#homeBotLevel button[data-level="medium"]')?.classList.add('sel');

  $('homeVsBots').addEventListener('click', playVsBots);
  $('homeQuick').addEventListener('click', quickPlay);
  $('homePrivate').addEventListener('click', privateRoom);

  $('homeName').addEventListener('change', saveGuestName);
  $('homeName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveGuestName(); } });

  const submit = type => {
    $('homeAuthErr').textContent = '';
    send({ type, username: $('homeUser').value.trim(), password: $('homePass').value });
  };
  $('homeAuth').addEventListener('submit', e => { e.preventDefault(); submit('login'); });
  $('homeRegister').addEventListener('click', () => submit('register'));
  $('homeLogout').addEventListener('click', () => send({ type: 'logout' }));
  $('homeSkipAuth').addEventListener('click', () => {
    $('homeGuest').dataset.skipped = '1';
    authLayout = null;
    syncHomeAuth(true);
  });
  $('homeShowAuth').addEventListener('click', () => {
    $('homeGuest').dataset.skipped = '';
    authLayout = null;
    syncHomeAuth(true);
    $('homeUser').focus();
  });
}
