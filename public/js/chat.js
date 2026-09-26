// Text chat for everyone in the room. In the lobby it's a card with the box always there; in a
// match it moves to the bottom left, the chat key (Enter) opens the box, Enter sends and Esc
// closes, and messages fade after a while (they come back while you're typing).
import { S } from './state.js';
import { send } from './net.js';
import { settings, keyName } from './settings.js';

const $ = id => document.getElementById(id);
const KEEP = 50, FADE_MS = 8000;
export const CHAT_MAX = 140; // the server cuts messages at this length too

export const chatOpen = () => document.activeElement === $('chatInput');

export function openChat() {
  const input = $('chatInput');
  S.keys = {}; S.mouseHeld = false; // don't keep running or firing while you type
  input.hidden = false;
  document.body.classList.add('chatting');
  input.focus();
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
  input.placeholder = S.started ? `Press ${keyName(settings.keys.chat)} to chat` : 'Say something…';
  input.hidden = S.started && !chatOpen(); // in a match the box only shows while you type
  const home = S.started ? document.body : $('chatCard');
  if (chat.parentNode !== home && !chatOpen()) home.append(chat);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
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
  line.dataset.t = performance.now();
  const log = $('chatLog');
  log.append(line);
  while (log.children.length > KEEP) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// every frame: in a match, old lines fade unless the box is open
export function updateChat(now) {
  const typing = chatOpen();
  for (const line of $('chatLog').children) line.classList.toggle('old', S.started && !typing && now - line.dataset.t > FADE_MS);
}

export function initChat() {
  const input = $('chatInput');
  input.maxLength = CHAT_MAX;
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // the game's key handler ignores typing anyway; keep Enter/Esc here
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text) send({ type: 'chat', text });
      closeChat();
      e.preventDefault();
    } else if (e.key === 'Escape') closeChat();
  });
  input.addEventListener('blur', () => { document.body.classList.remove('chatting'); showHint(); });
  input.addEventListener('focus', () => { S.keys = {}; document.body.classList.add('chatting'); });
  showHint();
}

// the lobby shows the box all the time, a match hides it until you press the chat key
export const refreshChat = showHint;
