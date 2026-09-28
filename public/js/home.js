// First screen: sign in, create an account, or continue as a guest — then straight to the lobby.
// Shown when you open the site with no ?room= / ?play= and haven't signed in or chosen guest before.
// Invite links and play links skip it.
import { send, switchRoom } from './net.js';
import { setToken, hasEntered, setEntered } from './profile.js';
import { newCode } from './room.js';
import { newTrack } from './audio.js';

const $ = id => document.getElementById(id);

// true while the home screen is covering the lobby
export const homeOpen = () => !$('home').hidden;

let leaveHook = null;
export function onHomeLeave(fn) { leaveHook = fn; }

function hideHome() {
  if ($('home').hidden) return;
  $('home').hidden = true;
  document.body.classList.remove('on-home');
  leaveHook?.();
}

// into a fresh private lobby, on this page (a reload would drop fullscreen)
function enterLobby() {
  setEntered(true);
  newTrack(); // a fresh tune for the lobby
  hideHome();
  switchRoom('?room=' + newCode());
}

// signed out in the lobby: back to the sign-in screen
export function showHome() {
  $('homeAuthErr').textContent = '';
  $('home').hidden = false;
  document.body.classList.add('on-home');
  switchRoom('');
}

// signed in (just now, or this browser's token already belongs to an account): go play
export function homeProfile(msg) {
  if (homeOpen() && msg.username) enterLobby();
}

export function homeAuth(msg) {
  if (!homeOpen()) return;
  if (msg.error) { $('homeAuthErr').textContent = msg.error; return; }
  $('homePass').value = '';
  $('homeAuthErr').textContent = '';
  if (msg.token) setToken(msg.token);
  // the profile message that follows calls homeProfile, which enters the lobby
}

export function initHome() {
  const submit = type => {
    $('homeAuthErr').textContent = '';
    if (type === 'register' && $('homePass').value.length < 15) {
      $('homeAuthErr').textContent = 'Choose a password with at least 15 characters';
      return;
    }
    send({ type, username: $('homeUser').value.trim(), password: $('homePass').value });
  };
  $('homeAuth').addEventListener('submit', e => { e.preventDefault(); submit('login'); });
  $('homeRegister').addEventListener('click', () => submit('register'));
  $('homeSkipAuth').addEventListener('click', enterLobby);

  const q = new URLSearchParams(location.search);
  if (q.get('room') || q.get('play') === '1') hideHome();
  else if (hasEntered()) { history.replaceState(null, '', '?room=' + newCode()); hideHome(); } // connect() joins it
  else { $('home').hidden = false; document.body.classList.add('on-home'); }
}
