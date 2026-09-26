// Text chat for everyone in the room, plus private DMs to friends. In the lobby it's the
// Messages card with the box always there; in a match it moves to the bottom left, the chat
// key (Enter) opens the box, Enter sends and Esc closes, and messages fade after a while.
import { S } from './state.js';
import { isTeamMode } from '/shared/config.js';
import { send } from './net.js';
import { settings, keyName } from './settings.js';
import { toast } from './ui.js';

const $ = id => document.getElementById(id);
const KEEP = 50, FADE_MS = 8000;
export const CHAT_MAX = 140; // the server cuts messages at this length too

let dmTo = null; // { username, name } when messaging a friend privately
let wantChat = false; // true while the match chat box should stay open (survives blur races)

export const chatOpen = () => wantChat || document.activeElement === $('chatInput');

function placeChat() {
  const chat = $('chat');
  const home = S.started ? document.body : $('chatCard');
  if (home && chat.parentNode !== home) home.append(chat);
}

function focusInput() {
  const input = $('chatInput');
  if (!input || input.hidden) return;
  try { input.focus({ preventScroll: true }); } catch { input.focus(); }
}

export function openChat() {
  const input = $('chatInput');
  S.keys = {}; S.mouseHeld = false; S.aimHeld = false; // don't keep running or firing while you type
  wantChat = true;
  placeChat();
  input.hidden = false;
  document.body.classList.add('chatting');
  // pointer lock steals keyboard focus — unlock, then focus the box
  if (document.pointerLockElement) {
    const onUnlock = () => {
      if (document.pointerLockElement) return;
      document.removeEventListener('pointerlockchange', onUnlock);
      focusInput();
    };
    document.addEventListener('pointerlockchange', onUnlock);
    document.exitPointerLock();
    requestAnimationFrame(() => requestAnimationFrame(focusInput));
  } else focusInput();
  showHint();
}

export function openDm(username, name) {
  dmTo = { username, name: name || username };
  openChat();
  toast('Private message to ' + dmTo.name);
}

function relock() {
  if (!S.started || document.pointerLockElement) return;
  const c = $('c');
  if (c) c.requestPointerLock().catch(() => {});
}

function closeChat() {
  const input = $('chatInput');
  wantChat = false;
  dmTo = null;
  input.value = '';
  input.blur();
  document.body.classList.remove('chatting');
  showHint();
  relock();
}

function showHint() {
  const input = $('chatInput');
  if (dmTo) input.placeholder = `DM ${dmTo.name}… (Esc clears)`;
  else if (S.started) input.placeholder = wantChat ? 'Message the room… (Esc closes)' : `Press ${keyName(settings.keys.chat)} to chat`;
  else input.placeholder = 'Type a message… (/w user text for DM)';
  placeChat();
  // keep the box visible while chatting; otherwise hide it in a match
  input.hidden = S.started && !wantChat;
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}

function pushLine(line) {
  line.dataset.t = performance.now();
  const log = $('chatLog');
  log.append(line);
  while (log.children.length > KEEP) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  // new messages should be readable in-game even if you weren't chatting
  if (S.started) line.classList.remove('old');
}

// a message from the server: { id, name, team, text }
export function addChat(msg) {
  const line = document.createElement('div');
  const who = document.createElement('span'), text = document.createElement('span');
  who.textContent = msg.name + ': ';
  const teams = S.room && isTeamMode(S.room.mode);
  who.className = msg.id === S.myId ? 'me' : !teams ? 'other' : msg.team === S.myTeam ? 'ally' : 'foe';
  text.textContent = msg.text;
  line.append(who, text);
  pushLine(line);
  if (S.started && !chatOpen() && msg.id !== S.myId) toast(`${msg.name}: ${msg.text.slice(0, 60)}`);
}

// private message: { from, username, to, text, self }
export function addDm(msg) {
  const line = document.createElement('div');
  line.className = 'dm';
  const who = document.createElement('span'), text = document.createElement('span');
  who.className = 'dm-tag';
  who.textContent = msg.self ? `to ${msg.to}: ` : `${msg.from} (whisper): `;
  text.textContent = msg.text;
  line.append(who, text);
  pushLine(line);
  if (!msg.self && S.started && !chatOpen()) toast(`${msg.from}: ${msg.text.slice(0, 60)}`);
}

// room events (join, leave, vote, match start…) — no speaker name
export function addSystem(text) {
  if (!text) return;
  const line = document.createElement('div');
  line.className = 'sys';
  line.textContent = text;
  pushLine(line);
}

// every frame: in a match, old lines fade unless the box is open
export function updateChat(now) {
  const typing = chatOpen();
  for (const line of $('chatLog').children) line.classList.toggle('old', S.started && !typing && now - line.dataset.t > FADE_MS);
}

function sendLine(raw) {
  let text = raw.trim();
  if (!text) return;
  // /w name message  or  /msg name message
  const whisper = text.match(/^\/(?:w|msg|dm)\s+(\w{3,16})\s+(.+)$/i);
  if (whisper) {
    send({ type: 'dm', username: whisper[1], text: whisper[2].slice(0, CHAT_MAX) });
    return;
  }
  if (dmTo) {
    send({ type: 'dm', username: dmTo.username, text: text.slice(0, CHAT_MAX) });
    return;
  }
  send({ type: 'chat', text: text.slice(0, CHAT_MAX) });
}

export function initChat() {
  const input = $('chatInput');
  input.maxLength = CHAT_MAX + 24; // room for "/w name " prefix
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // the game's key handler ignores typing anyway; keep Enter/Esc here
    if (e.key === 'Enter') {
      e.preventDefault();
      sendLine(input.value);
      closeChat();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (dmTo) { dmTo = null; input.value = ''; showHint(); focusInput(); return; }
      closeChat();
    }
  });
  // blur races with pointer-lock unlock — only close if we really left the box
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (wantChat) {
        if (document.activeElement !== input) focusInput();
        return;
      }
      document.body.classList.remove('chatting');
      showHint();
    }, 30);
  });
  input.addEventListener('focus', () => { S.keys = {}; document.body.classList.add('chatting'); });
  showHint();
}

// the lobby shows the box all the time, a match hides it until you press the chat key
export const refreshChat = showHint;
