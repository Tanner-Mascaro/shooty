// Lobby profile panel: your name and stats, sign in / create account / sign out, leaderboard.
// The server does the checking; see the hello/register/login/logout handlers in server/hub.js.
import { send } from './net.js';
import { token, setToken, clearToken, savedName, saveName } from './profile.js';

const $ = id => document.getElementById(id);
let me = {}; // latest profile message, merged (stat-only updates arrive after every kill)
let board = []; // latest leaderboard rows

// sent on connect and whenever you change your name; the server replies with a profile message
export function sendHello() { send({ type: 'hello', token: token(), name: savedName() }); }

export function initAccount() {
  const nameInput = $('nameInput'), form = $('authForm');
  nameInput.value = savedName();
  nameInput.addEventListener('change', () => { saveName(nameInput.value.trim()); sendHello(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });

  $('showAuth').addEventListener('click', () => { form.hidden = false; $('signedOut').hidden = true; $('authUser').focus(); });
  const submit = type => {
    $('authErr').textContent = '';
    send({ type, username: $('authUser').value.trim(), password: $('authPass').value });
  };
  form.addEventListener('submit', e => { e.preventDefault(); submit('login'); });
  $('registerBtn').addEventListener('click', () => submit('register'));
  $('logoutBtn').addEventListener('click', () => send({ type: 'logout' }));
}

export function showProfile(msg) {
  me = Object.assign(me, msg);
  const nameInput = $('nameInput');
  if (me.username) saveName(me.name); // signed in: the account's name wins over what this browser had
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

  $('signedIn').hidden = !me.username;
  $('signedOut').hidden = !!me.username;
  $('acctName').textContent = me.username || '';
  drawBoard(); // your highlighted row may have changed
}

// reply to register / login / logout
export function onAuth(msg) {
  if (msg.error) { $('authErr').textContent = msg.error; return; }
  $('authPass').value = '';
  $('authForm').hidden = true; // the next profile message shows signed in / signed out
  if (msg.token) setToken(msg.token); // signed in: this browser now belongs to the account
  if (msg.signedOut) {
    clearToken(); saveName('');
    me = {};
    sendHello(); // start over as a new guest
  }
}

export function showBoard(rows) { board = rows; drawBoard(); }

function drawBoard() {
  const body = $('board').tBodies[0];
  body.replaceChildren(...board.map((r, i) => {
    const tr = document.createElement('tr');
    if (i + 1 === me.rank && r.name === me.name) tr.className = 'you';
    const kd = r.deaths ? (r.kills / r.deaths).toFixed(2) : String(r.kills);
    for (const v of [i + 1, r.name, r.wins, r.losses, r.kills, kd]) tr.appendChild(document.createElement('td')).textContent = v;
    return tr;
  }));
  $('boardCard').hidden = board.length === 0;
}
