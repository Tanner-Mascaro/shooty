// Text chat for everyone in the room, plus private DMs to friends. In the lobby it's the
// Messages card with the box always there; in a match it moves to the bottom left, the chat
// key (Enter) opens the box, Enter sends and Esc closes, and messages fade after a while.
import { S } from './state.js';
import { send } from './net.js';
import { settings, keyName } from './settings.js';
import { toast } from './ui.js';

const $ = id => document.getElementById(id);
const KEEP = 50, FADE_MS = 8000;
export const CHAT_MAX = 140; // the server cuts messages at this length too

let dmTo = null; // { username, name } when messaging a friend privately

export const chatOpen = () => document.activeElement === $('chatInput');

export function openChat() {
  const input = $('chatInput');
  S.keys = {}; S.mouseHeld = false; // don't keep running or firing while you type
  input.hidden = false;
  document.body.classList.add('chatting');
  input.focus();
}

export function openDm(username, name) {
  dmTo = { username, name: name || username };
  openChat();
  showHint();
  toast('Private message to ' + dmTo.name);
}

function closeChat() {
  const input = $('chatInput');
  input.value = '';
  input.blur();
  document.body.classList.remove('chatting');
  showHint();
}

function showHint() {
  const input = $('chatInput'), chat = $('chat');
  if (dmTo) input.placeholder = `DM ${dmTo.name}… (Esc clears)`;
  else input.placeholder = S.started ? `Press ${keyName(settings.keys.chat)} to message` : 'Type a message… (/w user text for DM)';
  input.hidden = S.started && !chatOpen(); // in a match the box only shows while you type
  const home = S.started ? document.body : $('chatCard');
  if (chat.parentNode !== home && !chatOpen()) home.append(chat);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}

function pushLine(line) {
  line.dataset.t = performance.now();
  const log = $('chatLog');
  log.append(line);
  while (log.children.length > KEEP) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// a message from the server: { id, name, team, text }
export function addChat(msg) {
  const line = document.createElement('div');
  const who = document.createElement('span'), text = document.createElement('span');
  who.textContent = msg.name + ': ';
  const teams = S.room && S.room.mode === 'teams';
  who.className = msg.id === S.myId ? 'me' : !teams ? 'other' : msg.team === S.myTeam ? 'ally' : 'foe';
  text.textContent = msg.text;
  line.append(who, text);
  pushLine(line);
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
      sendLine(input.value);
      closeChat();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (dmTo) { dmTo = null; input.value = ''; showHint(); e.preventDefault(); return; }
      closeChat();
    }
  });
  input.addEventListener('blur', () => { document.body.classList.remove('chatting'); showHint(); });
  input.addEventListener('focus', () => { S.keys = {}; document.body.classList.add('chatting'); });
  showHint();
}

// the lobby shows the box all the time, a match hides it until you press the chat key
export const refreshChat = showHint;
