// Lobby profile panel: your name and stats, sign in / create account / sign out, leaderboard.
// The server does the checking; see the hello/register/login/logout handlers in server/hub.js.
import { send } from './net.js';
import { token, setToken, clearToken, savedName, saveName, savedSkin, setEntered } from './profile.js';
import { homeProfile, homeAuth, homeOpen, showHome } from './home.js';
import { canFriend } from './friends.js';
import { levelInfo, skinsUnlockedBetween } from '/shared/progression.js';
import { S } from './state.js';
import { updateLoadout } from './room.js';
import { banner, toast, showXpGain } from './ui.js';
import { PLAYER_SKIN_NAMES } from './render/sprites.js';

const $ = id => document.getElementById(id);
let me = {}; // latest profile message, merged (stat-only updates arrive after every kill)
let board = []; // latest leaderboard rows

// sent on connect and whenever you change your name; the server replies with a profile message
export function sendHello() { send({ type: 'hello', token: token(), name: savedName(), skin: savedSkin() }); }

export function initAccount() {
  const nameInput = $('nameInput'), form = $('authForm');
  nameInput.value = savedName();
  nameInput.addEventListener('change', () => { saveName(nameInput.value.trim()); sendHello(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });

  // the Account popup: name, sign in / create account, password, sign out
  const modal = $('accountModal');
  const close = () => { modal.hidden = true; $('openAccount').focus(); };
  $('openAccount').addEventListener('click', () => {
    $('authErr').textContent = ''; $('pwMsg').textContent = '';
    modal.hidden = false;
    modal.querySelector('.modalClose').focus();
  });
  modal.querySelector('.modalClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || modal.hidden) return;
    e.stopImmediatePropagation();
    close();
  }, true);
  $('pwForm').addEventListener('submit', e => {
    e.preventDefault();
    $('pwMsg').textContent = '';
    if ($('pwNew').value.length < 15) { $('pwMsg').textContent = 'Choose a new password with at least 15 characters'; return; }
    send({ type: 'password', current: $('pwCurrent').value, password: $('pwNew').value });
  });
  const submit = type => {
    $('authErr').textContent = '';
    if (type === 'register' && $('authPass').value.length < 15) {
      $('authErr').textContent = 'Choose a password with at least 15 characters';
      return;
    }
    send({ type, username: $('authUser').value.trim(), password: $('authPass').value });
  };
  form.addEventListener('submit', e => { e.preventDefault(); submit('login'); });
  $('registerBtn').addEventListener('click', () => submit('register'));
  $('logoutBtn').addEventListener('click', () => send({ type: 'logout' }));
  $('board').addEventListener('click', e => {
    const b = e.target.closest('[data-friend-row]');
    if (!b) return;
    const row = board[+b.dataset.friendRow];
    if (row) send({ type: 'friendAdd', board: +b.dataset.friendRow, name: row.name });
    b.disabled = true;
  });
}

// XP and level: the profile card's bar, a banner when you level up (naming any skins it unlocks),
// and the XP gained on the match summary
function showXp() {
  const xp = me.xp || 0, before = S.xp, { level, into, need } = levelInfo(xp);
  S.xp = xp;
  $('levelNum').textContent = 'Level ' + level;
  $('xpFill').style.width = Math.round(100 * into / need) + '%';
  $('xpText').textContent = into + ' / ' + need + ' XP';
  const was = levelInfo(before).level;
  if (xpSeen && level > was) {
    const skins = skinsUnlockedBetween(was, level).map(s => PLAYER_SKIN_NAMES[s] || s);
    const text = 'LEVEL ' + level + (skins.length ? ' — ' + skins.join(', ') + ' unlocked' : '');
    if (S.started) banner(text, true); else toast(text);
  }
  xpSeen = true;
  showXpGain();
  updateLoadout(); // locked / unlocked character cards
}
let xpSeen = false;

export function showProfile(msg) {
  me = Object.assign(me, msg);
  if ('xp' in msg) showXp();
  if (me.username) saveName(me.name); // signed in: the account's name wins over what this browser had
  homeProfile(me);
  if (homeOpen()) return; // home has its own auth UI — skip rebuilding the hidden lobby panel

  const nameInput = $('nameInput');
  // no name picked yet: show the default ("Player 3fa2") as a hint
  if (!savedName()) { nameInput.value = ''; nameInput.placeholder = me.name; }
  else if (document.activeElement !== nameInput) nameInput.value = me.name;

  const kd = me.deaths ? (me.kills / me.deaths).toFixed(2) : me.kills;
  $('stats').replaceChildren(...[
    ['rank', me.rank ? '#' + me.rank : '—'], ['wins', me.wins], ['losses', me.losses],
    ['kills', me.kills], ['deaths', me.deaths], ['K/D', kd],
  ].map(([label, value]) => {
    const tile = document.createElement('div');
    tile.className = 'stat' + (label === 'rank' ? ' rank' : '');
    tile.append(document.createElement('b'), document.createElement('span'));
    tile.firstChild.textContent = value;
    tile.lastChild.textContent = label;
    return tile;
  }));

  $('acctIn').hidden = !me.username;
  $('acctOut').hidden = !!me.username;
  $('acctName').textContent = me.username || '';
  $('profileName').textContent = me.name || '';
  $('acctLine').textContent = me.username ? '@' + me.username : 'Guest — sign in from Account (top right) to keep your stats';
  drawBoard(); // your highlighted row may have changed
}

// reply to register / login / logout
export function onAuth(msg) {
  homeAuth(msg);
  if (homeOpen()) return; // homeAuth already handled the home form
  const signedIn = !$('acctIn').hidden; // errors go under the form you were using
  if (msg.error) { $(signedIn ? 'pwMsg' : 'authErr').textContent = msg.error; return; }
  if (msg.passwordChanged) {
    $('pwCurrent').value = ''; $('pwNew').value = '';
    $('pwMsg').textContent = 'Password changed';
    return;
  }
  $('authPass').value = '';
  if (msg.token) setToken(msg.token); // signed in: this browser now belongs to the account
  if (!msg.signedOut) $('accountModal').hidden = true; // signed in: the next profile message fills in the rest
  if (msg.signedOut) {
    $('accountModal').hidden = true;
    clearToken(); saveName('');
    setEntered(false);
    me = {};
    showHome(); // back to the sign-in screen (it reconnects as a new guest)
  }
}

export function showBoard(rows) {
  board = rows;
  if (!homeOpen()) drawBoard();
}

export function drawBoard() {
  const body = $('board').tBodies[0];
  body.replaceChildren(...board.map((r, i) => {
    const tr = document.createElement('tr');
    const mine = r.name === me.name && (i + 1 === me.rank || !!me.username);
    if (mine) tr.className = 'you';
    const kd = r.deaths ? (r.kills / r.deaths).toFixed(2) : String(r.kills);
    for (const v of [i + 1, r.name, r.wins, r.losses, r.kills, kd]) tr.appendChild(document.createElement('td')).textContent = v;
    const add = tr.appendChild(document.createElement('td'));
    if (r.account && !mine && canFriend(r.name)) {
      const b = add.appendChild(document.createElement('button'));
      b.type = 'button'; b.className = 'add-friend'; b.dataset.friendRow = i;
      b.textContent = '+'; b.title = 'Add ' + r.name + ' as a friend';
      b.setAttribute('aria-label', b.title);
    }
    return tr;
  }));
  $('boardCard').hidden = board.length === 0;
}
