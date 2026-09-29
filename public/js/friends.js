// Friends panel (accounts only): add by username, accept / decline requests, see who's online
// and where, invite them to your room or join theirs. Plus the invite popup you get from a friend.
import { S } from './state.js';
import { send } from './net.js';
import { goToRoom, showRoom } from './room.js';
import { switchRoom } from './net.js';
import { drawBoard } from './account.js';
import { openDm, setDmFriends } from './chat.js';
import { homeOpen } from './home.js';
import { MODE_NAMES } from '/shared/config.js';

const $ = id => document.getElementById(id);
let invite = null; // the invite on screen
let pendingFriends = undefined; // held while home is open
let friendList = null; // latest list; null while signed out

// signed in, and this name isn't already a friend or a request — the room list and the
// leaderboard show a + Friend button for accounts that pass
export const canFriend = name => !!friendList && !friendList.some(f => f.name === name);

export function initFriends() {
  $('friendForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('friendName').value.trim();
    if (name) send({ type: 'friendAdd', username: name });
    $('friendName').value = '';
  });
  $('inviteJoin').addEventListener('click', () => {
    if (!invite) return;
    if (invite.party) send({ type: 'partyAccept', id: invite.party }); else goToRoom(invite.room);
    $('invite').hidden = true; invite = null;
  });
  $('partyLeave').addEventListener('click', () => send({ type: 'partyLeave' }));
  $('inviteDismiss').addEventListener('click', () => { $('invite').hidden = true; invite = null; });
}

const button = (label, onClick, cls) => {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
};

// list: null for guests, else [{ username, name, status, online, room, count, playing }]
export function showFriends(list) {
  if (homeOpen()) { pendingFriends = list; return; }
  pendingFriends = undefined;
  friendList = list;
  setDmFriends(list);
  showRoom(); drawBoard(); // their + Friend buttons depend on the list
  $('friendsGuest').hidden = !!list;
  $('friendForm').hidden = !list;
  $('friendList').replaceChildren(...(list || []).map(f => {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = f.name;
    const sub = document.createElement('small');
    sub.textContent = ' @' + f.username;
    who.append(sub);
    const status = document.createElement('span');
    status.className = 'status';
    const actions = document.createElement('span');
    actions.className = 'actions';
    const u = f.username;
    if (f.status === 'incoming') {
      status.textContent = 'wants to be friends';
      actions.append(button('Accept', () => send({ type: 'friendAccept', username: u })), button('Decline', () => send({ type: 'friendRemove', username: u })));
    } else if (f.status === 'outgoing') {
      status.textContent = 'request sent';
      actions.append(button('Cancel', () => send({ type: 'friendRemove', username: u })));
    } else {
      const here = S.room && f.room === S.room.code;
      li.classList.toggle('online', f.online);
      status.textContent = !f.online ? 'offline' : here ? 'in your room' : `in room ${f.room} (${f.count})${f.playing ? ' · playing' : ''}`;
      if (f.online && !here) actions.append(button('Invite', () => send({ type: 'invite', username: u })), button('Join', () => goToRoom(f.room)));
      if (f.online && !here && f.playing) actions.append(button('Watch', () => switchRoom('?room=' + f.room + '&watch=1')));
      if (f.online && !inParty.has(f.name)) actions.append(button('Party', () => send({ type: 'partyInvite', username: u })));
      actions.append(button('Msg', () => openDm(u, f.name)), button('✕', () => send({ type: 'friendRemove', username: u }), 'remove'));
    }
    li.append(who, status, actions);
    return li;
  }));
  $('friendEmpty').hidden = !list || list.length > 0;
}

export function flushFriends() {
  if (pendingFriends !== undefined) showFriends(pendingFriends);
}

// your party: { leader (you lead it), members: [{ name, leader, online, you }] } or members: null
let inParty = new Set();
export function showParty(msg) {
  const members = msg.members || [];
  inParty = new Set(members.map(m => m.name));
  $('partyBox').hidden = members.length < 2 && !msg.leader;
  $('partyList').replaceChildren(...members.map(m => {
    const li = document.createElement('li');
    li.textContent = (m.leader ? '♛ ' : '') + m.name + (m.you ? ' (you)' : '') + (m.online ? '' : ' · offline');
    return li;
  }));
  if (friendList) showFriends(friendList); // hide Party on friends already in it
}
// a friend asked you into their party: { from, id }
export function showPartyInvite(msg) {
  invite = { party: msg.id };
  $('inviteText').textContent = `${msg.from} invited you to their party — you'll follow them between rooms`;
  $('invite').hidden = false;
  $('inviteHint').hidden = !S.started;
}

// { from, username, room, mode, count }
export function showInvite(msg) {
  invite = msg;
  $('inviteText').textContent = `${msg.from} invited you to room ${msg.room} (${MODE_NAMES[msg.mode] || msg.mode}, ${msg.count} playing)`;
  $('invite').hidden = false;
  $('inviteHint').hidden = !S.started; // mid-match the mouse is captured
}
