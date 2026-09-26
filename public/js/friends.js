// Friends panel (accounts only): add by username, accept / decline requests, see who's online
// and where, invite them to your room or join theirs. Plus the invite popup you get from a friend.
import { S } from './state.js';
import { send } from './net.js';
import { goToRoom } from './room.js';
import { MODE_NAMES } from '/shared/config.js';

const $ = id => document.getElementById(id);
let invite = null; // the invite on screen

export function initFriends() {
  $('friendForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('friendName').value.trim();
    if (name) send({ type: 'friendAdd', username: name });
    $('friendName').value = '';
  });
  $('inviteJoin').addEventListener('click', () => invite && goToRoom(invite.room));
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
      actions.append(button('✕', () => send({ type: 'friendRemove', username: u }), 'remove'));
    }
    li.append(who, status, actions);
    return li;
  }));
  $('friendEmpty').hidden = !list || list.length > 0;
}

// { from, username, room, mode, count }
export function showInvite(msg) {
  invite = msg;
  $('inviteText').textContent = `${msg.from} invited you to room ${msg.room} (${MODE_NAMES[msg.mode] || msg.mode}, ${msg.count} playing)`;
  $('invite').hidden = false;
  $('inviteHint').hidden = !S.started; // mid-match the mouse is captured
}
