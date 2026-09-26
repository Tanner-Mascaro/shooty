// First screen: sign in (or play as guest) and pick how to start — vs bots, quick play, or private room.
// Shown when you open the site with no ?room= invite. Invite links skip straight to the lobby.
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
  syncHomeAuth();
}

let signedIn = false;

export function homeProfile(msg) {
  signedIn = !!msg.username;
  syncHomeAuth();
}

function syncHomeAuth() {
  if (!homeOpen()) return;
  const name = savedName();
  $('homeName').value = name;
  $('homeName').placeholder = name ? name : 'Your name';
  $('homeGuest').hidden = signedIn;
  $('homeSigned').hidden = !signedIn;
  $('homeAuth').hidden = signedIn || $('homeGuest').dataset.skipped === '1';
  if (!signedIn && $('homeGuest').dataset.skipped === '1') $('homeGuest').hidden = false;
  if (signedIn) {
    $('homeWelcome').textContent = 'Signed in as ' + (name || 'you');
    $('homeGuest').hidden = true;
    $('homeAuth').hidden = true;
  }
  $('homeAuthErr').textContent = '';
}

export function homeAuth(msg) {
  if (!homeOpen()) return;
  if (msg.error) { $('homeAuthErr').textContent = msg.error; return; }
  $('homePass').value = '';
  if (msg.token) setToken(msg.token);
  if (msg.signedOut) {
    clearToken(); saveName('');
    signedIn = false;
    send({ type: 'hello', token: token(), name: '', skin: 'demon' });
  }
  syncHomeAuth();
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
  hideHome();
  goToRoom(newCode());
}

function quickPlay() {
  initAudio();
  saveGuestName();
  hideHome();
  // already on quick play with no ?room=; with a stale room URL, go public
  if (new URLSearchParams(location.search).get('room')) goToRoom(null);
}

function privateRoom() {
  initAudio();
  saveGuestName();
  hideHome();
  goToRoom(newCode());
}

export function initHome() {
  const hasRoom = !!new URLSearchParams(location.search).get('room');
  if (hasRoom) { hideHome(); return; }
  showHome();

  document.querySelectorAll('#homeBotLevel button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#homeBotLevel button').forEach(x => x.classList.toggle('sel', x === b));
  }));
  // default medium
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
    $('homeAuth').hidden = true;
    $('homeGuest').hidden = false;
  });
  $('homeShowAuth').addEventListener('click', () => {
    $('homeGuest').dataset.skipped = '';
    $('homeAuth').hidden = false;
    $('homeGuest').hidden = true;
    $('homeUser').focus();
  });
}
