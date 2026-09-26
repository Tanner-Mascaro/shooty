// Everyone connected to the server: which room each player is in, accounts and saved stats,
// friends and invites. Match logic lives in room.js; storage in profiles.js.
//
// Rooms are joined by URL: /?room=CODE joins (or creates) that private room; /?play=1 is
// quick play (any public room with space). Bare / is the sign-in menu — no room until they pick.
import { MAX_PLAYERS, PLAYER_SKINS } from '../shared/config.js';
import { Room } from './room.js';
import { log } from './log.js';
import { STATS, hashToken, newToken, hashPassword, checkPassword } from './profiles.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L mix-ups
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const roomCodeFrom = url => {
  const code = new URL(url || '/', 'http://x').searchParams.get('room');
  return code && /^[A-Za-z0-9]{3,8}$/.test(code) ? code.toUpperCase() : null;
};
export const wantsQuickPlay = url => new URL(url || '/', 'http://x').searchParams.get('play') === '1';

// failed sign-ins per IP: 5 a minute, then locked out until the minute is up
const fails = new Map();
const lockedOut = ip => { const f = fails.get(ip); return !!f && f.until > Date.now() && f.n >= 5; };
const failedLogin = ip => {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) fails.set(ip, { n: 1, until: Date.now() + 60000 }); else f.n++;
};
const cleanName = name => String(name ?? '').replace(/[^\w .-]/g, '').trim().slice(0, 16);

const AUTH = ['register', 'login', 'logout'];
const INVITE_GAP = 10000; // ms between invites to the same friend
const CHAT_MAX = 140; // same cap as room chat / public/js/chat.js

export class Hub {
  constructor(profiles) {
    this.profiles = profiles;
    this.conns = {};           // id -> connected player
    this.rooms = {};           // code -> Room
    this.online = new Map();   // profile id -> Set of connections (same account in two tabs)
    this.nextId = 0;
    this.saving = Promise.resolve();
    this.invited = new Map();  // "from>to" -> time, for the invite rate limit
  }

  // --- messaging ---
  send(p, msg) { if (p.socket) this.sendRaw(p, JSON.stringify(msg)); }
  sendRaw(p, data) { if (p.socket) try { p.socket.send(data); } catch {} }
  notice(p, text) { this.send(p, { type: 'notice', text }); }

  // how a player appears in-game and in the server log
  name(p) { return p.name || (p.bot ? `Player ${p.id}` : `Player ${p.id}`); }
  who(p) { return p.bot ? this.name(p) : `${p.name} (${p.ip})`; }

  tick() { for (const r of Object.values(this.rooms)) r.tick(); }

  // --- connections and rooms ---
  connect(socket, ip, url) {
    const id = this.nextId++;
    const p = this.conns[id] = { id, socket, ip, joinedAt: Date.now(), name: `Player ${id}`, pid: null, username: null };
    log(`${this.who(p)} connected (${Object.keys(this.conns).length} online)`);
    const code = roomCodeFrom(url);
    if (code) this.joinRoom(p, code);
    else if (wantsQuickPlay(url)) this.joinRoom(p, null);
    // bare /: stay on the sign-in menu with no room (auth / friends still work)

    socket.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!msg || !this.conns[id]) return;
      const room = p.room, rh = room && room.handlers[msg.type], hh = this.handlers[msg.type];
      if (!rh && !hh) return;
      Promise.resolve(rh ? rh.call(room, p, msg) : hh.call(this, p, msg)).catch(e => {
        log(`Error handling ${msg.type} from ${this.who(p)}: ${e.stack || e.message}`);
        if (AUTH.includes(msg.type)) this.send(p, { type: 'auth', error: 'Server error — try again' });
      });
    });
    const leave = () => this.disconnect(p);
    socket.on('close', leave);
    socket.on('error', leave);
  }

  joinRoom(p, code) {
    let room = null;
    if (code) {
      room = this.rooms[code] ??= new Room(this, code, true);
      if (room.full) { this.notice(p, `Room ${code} is full — you've been put in another game`); room = null; }
    }
    room ??= Object.values(this.rooms).find(r => !r.private && !r.full) || this.newRoom();
    room.add(p);
    log(`${this.who(p)} joined room ${room.code}${room.private ? ' (private)' : ''} — ${room.list.length}/${MAX_PLAYERS}`);
    this.presence(p);
  }

  newRoom() {
    let code;
    do code = randomCode(); while (this.rooms[code]);
    return this.rooms[code] = new Room(this, code, false);
  }

  closeRoom(room) {
    delete this.rooms[room.code];
    log(`Room ${room.code} closed`);
  }

  disconnect(p) {
    if (!this.conns[p.id]) return;
    delete this.conns[p.id];
    const mins = ((Date.now() - p.joinedAt) / 60000).toFixed(1);
    log(`${this.who(p)} disconnected after ${mins} min${p.room && p.room.gameOn ? ', mid-match — ' + p.room.score() : ''}`);
    if (p.room) p.room.remove(p);
    this.setProfile(p, null);
  }

  // --- profiles (see profiles.js) ---
  // bump a player's saved stats (bot matches count — most play is vs bots)
  record(p, delta) {
    if (!p || !p.pid) return;
    for (const s in delta) p.stats[s] += delta[s];
    this.send(p, Object.assign({ type: 'profile' }, p.stats));
    const save = this.profiles.add(p.pid, delta).catch(e => log(`Could not save stats for ${this.who(p)}: ${e.message}`));
    this.saving = Promise.all([this.saving, save]); // the leaderboard waits for these
  }

  // which saved profile a connection is using; keeps the online list (for friends) current
  setProfile(p, pid) {
    const old = p.pid;
    if (old === pid) return;
    if (old) {
      const set = this.online.get(old);
      set.delete(p);
      if (!set.size) this.online.delete(old);
    }
    p.pid = pid;
    if (pid) { if (!this.online.has(pid)) this.online.set(pid, new Set()); this.online.get(pid).add(p); }
    if (old) this.presenceOf(old);
  }

  // point a connection at a saved profile and send it; false if they left meanwhile
  async useProfile(p, pid, name) {
    const saved = await this.profiles.load(pid, name, 'Player ' + pid.slice(0, 4));
    if (!this.conns[p.id]) return false;
    this.setProfile(p, pid);
    p.name = saved.name; p.username = saved.username;
    p.stats = Object.fromEntries(STATS.map(s => [s, saved[s]]));
    this.send(p, { type: 'settings', settings: saved.settings }); // null: the browser sends its own
    await this.sendProfile(p);
    this.sendFriends(p);
    this.presence(p);
    if (p.room) p.room.roster(); // new name
    return true;
  }

  async sendProfile(p) {
    const rank = await this.profiles.rank(p.stats).catch(() => null);
    this.send(p, Object.assign({ type: 'profile', name: p.name, username: p.username, rank }, p.stats));
  }

  // top players, to one player or everyone, once pending stat saves have landed
  async sendBoard(to) {
    await this.saving;
    try {
      const data = JSON.stringify({ type: 'leaderboard', rows: await this.profiles.board() });
      for (const p of to ? [to] : Object.values(this.conns)) this.sendRaw(p, data);
    } catch (e) { log('Could not load leaderboard: ' + e.message); }
  }

  async afterMatch(room) {
    await this.sendBoard();
    for (const p of room.humans) if (p.pid) await this.sendProfile(p); // new rank
  }

  // --- friends ---
  // your friends list with who's online and in which room; guests get null (need an account)
  async sendFriends(p) {
    if (!p.pid || !p.username) return this.send(p, { type: 'friends', list: null });
    const list = (await this.profiles.friends(p.pid)).map(f => {
      const c = f.status === 'friend' && this.online.has(f.id) ? [...this.online.get(f.id)].at(-1) : null; // newest tab
      const room = c && c.room;
      return { username: f.username, name: f.name, status: f.status, online: !!c,
        room: room ? room.code : null, count: room ? room.list.length : 0, playing: !!(room && room.gameOn) };
    });
    this.send(p, { type: 'friends', list });
  }

  // this player came online, went offline or changed room: refresh their friends' lists
  presence(p) { if (p.pid) this.presenceOf(p.pid); }
  async presenceOf(pid) {
    try {
      for (const f of await this.profiles.friends(pid))
        for (const c of this.online.get(f.id) || []) this.sendFriends(c);
    } catch (e) { log('Could not update friends: ' + e.message); }
  }
  // both sides' lists after a friend request / accept / remove
  refreshPair(p, otherId) {
    for (const c of this.online.get(p.pid) || []) this.sendFriends(c);
    for (const c of this.online.get(otherId) || []) this.sendFriends(c);
  }
  // an account by username, for friend actions; tells the player if there's no such account
  async target(p, username) {
    if (!p.username) { this.notice(p, 'Sign in to add friends'); return null; }
    const acct = await this.profiles.account(String(username ?? '').trim().slice(0, 16));
    if (!acct) { this.notice(p, `No player with the username "${String(username ?? '').slice(0, 16)}"`); return null; }
    if (acct.id === p.pid) { this.notice(p, "That's you!"); return null; }
    return acct;
  }
}

// client -> server messages that aren't about the match; `this` is the Hub, `p` the sender
Hub.prototype.handlers = {
  // the browser's token + chosen name: sent on connect and whenever the name changes
  async hello(p, msg) {
    if (typeof msg.token !== 'string' || msg.token.length < 16 || msg.token.length > 128) return;
    const before = this.who(p), first = !p.tokenHash, oldName = p.name, oldSkin = p.skin;
    if (PLAYER_SKINS.includes(msg.skin)) p.skin = msg.skin;
    p.tokenHash = hashToken(msg.token);
    const pid = await this.profiles.resolve(p.tokenHash);
    if (!await this.useProfile(p, pid, cleanName(msg.name) || null)) return;
    if (first) {
      log(`${before} is ${p.name}${p.username ? ' (account ' + p.username + ')' : ''} — ${STATS.map(s => p.stats[s] + ' ' + s).join(', ')}`);
      this.sendBoard(p);
    } else if (p.name !== oldName) log(`${before} renamed to ${p.name}`);
    if (p.room && p.skin !== oldSkin) p.room.roster();
  },

  // your game settings changed (FPS, keys, ...): keep them on your profile
  async settings(p, msg) {
    const s = msg.settings;
    if (!p.pid || !s || typeof s !== 'object' || Array.isArray(s) || JSON.stringify(s).length > 4000) return;
    await this.profiles.saveSettings(p.pid, s);
  },

  // create an account: puts a username + password on your current profile, keeping its stats
  async register(p, msg) {
    if (!p.pid) return;
    if (p.room && p.room.gameOn) return this.send(p, { type: 'auth', error: 'Finish the match first' });
    const username = String(msg.username ?? '').trim(), password = String(msg.password ?? '');
    const bad = p.username ? 'You are already signed in'
      : !/^\w{3,16}$/.test(username) ? 'Username: 3-16 letters, numbers or _'
      : password.length < 6 || password.length > 72 ? 'Password: 6-72 characters' : null;
    if (bad) return this.send(p, { type: 'auth', error: bad });
    if (!await this.profiles.claim(p.pid, username, await hashPassword(password)))
      return this.send(p, { type: 'auth', error: 'That username is taken' });
    p.username = username;
    log(`${this.who(p)} created account ${username}`);
    this.send(p, { type: 'auth', ok: true });
    await this.sendProfile(p);
    this.sendFriends(p);
  },

  // sign in on this browser: it gets a new token tied to the account's profile
  async login(p, msg) {
    if (!p.tokenHash) return;
    if (p.room && p.room.gameOn) return this.send(p, { type: 'auth', error: 'Finish the match first' });
    if (lockedOut(p.ip)) return this.send(p, { type: 'auth', error: 'Too many tries — wait a minute' });
    const username = String(msg.username ?? '').trim().slice(0, 16), password = String(msg.password ?? '').slice(0, 72);
    const acct = username && await this.profiles.account(username);
    // check against a dummy hash when there's no such user, so both cases take the same time
    if (!await checkPassword(password, acct ? acct.passHash : '00:00') || !acct) {
      failedLogin(p.ip);
      log(`${this.who(p)} failed to sign in as ${username}`);
      return this.send(p, { type: 'auth', error: 'Wrong username or password' });
    }
    const before = this.who(p), token = newToken();
    await this.profiles.addSession(hashToken(token), acct.id);
    p.tokenHash = hashToken(token);
    this.send(p, { type: 'auth', ok: true, token });
    if (await this.useProfile(p, acct.id, null)) log(`${before} signed in as ${p.username}`);
  },

  // the browser throws its token away and starts over as a new guest
  async logout(p) {
    if (!p.username || (p.room && p.room.gameOn)) return;
    await this.profiles.removeSession(p.tokenHash);
    log(`${this.who(p)} signed out`);
    this.setProfile(p, null);
    p.username = null;
    this.send(p, { type: 'auth', ok: true, signedOut: true });
    this.send(p, { type: 'friends', list: null });
  },

  async friendAdd(p, msg) {
    const t = await this.target(p, msg.username);
    if (!t) return;
    const res = await this.profiles.friendRequest(p.pid, t.id);
    const them = String(msg.username).trim();
    if (res === 'limit') return this.notice(p, 'Your friends list is full');
    if (res === 'already') return this.notice(p, `You've already added ${them}`);
    log(`${this.who(p)} ${res === 'accepted' ? 'is now friends with' : 'sent a friend request to'} ${them}`);
    this.notice(p, res === 'accepted' ? `You and ${them} are now friends` : `Friend request sent to ${them}`);
    for (const c of this.online.get(t.id) || [])
      this.notice(c, res === 'accepted' ? `${p.username} accepted your friend request` : `${p.username} sent you a friend request`);
    this.refreshPair(p, t.id);
  },

  async friendAccept(p, msg) {
    const t = await this.target(p, msg.username);
    if (!t || !await this.profiles.friendAccept(p.pid, t.id)) return;
    log(`${this.who(p)} is now friends with ${msg.username}`);
    for (const c of this.online.get(t.id) || []) this.notice(c, `${p.username} accepted your friend request`);
    this.refreshPair(p, t.id);
  },

  // unfriend, decline a request, or cancel one you sent
  async friendRemove(p, msg) {
    const t = await this.target(p, msg.username);
    if (!t) return;
    await this.profiles.friendRemove(p.pid, t.id);
    this.refreshPair(p, t.id);
  },

  async invite(p, msg) {
    const t = await this.target(p, msg.username);
    if (!t || !p.room) return;
    const f = (await this.profiles.friends(p.pid)).find(f => f.id === t.id);
    if (!f || f.status !== 'friend') return this.notice(p, 'You can only invite friends');
    const conns = [...(this.online.get(t.id) || [])];
    if (!conns.length) return this.notice(p, `${f.name} is offline`);
    if (conns.some(c => c.room === p.room)) return this.notice(p, `${f.name} is already in your room`);
    const key = p.pid + '>' + t.id, now = Date.now();
    if (now - (this.invited.get(key) || 0) < INVITE_GAP) return this.notice(p, 'Invite already sent — give them a moment');
    this.invited.set(key, now);
    for (const c of conns) this.send(c, { type: 'invite', from: p.name, username: p.username, room: p.room.code,
      mode: p.room.mode, count: p.room.list.length });
    log(`${this.who(p)} invited ${f.username} to room ${p.room.code}`);
    this.notice(p, `Invited ${f.name}`);
  },

  // private message to a friend (works across rooms; both must be signed in)
  async dm(p, msg) {
    if (!p.pid || !p.username) return this.notice(p, 'Sign in to send private messages');
    const text = String(msg.text ?? '').trim().slice(0, CHAT_MAX);
    if (!text) return;
    const t = await this.target(p, msg.username);
    if (!t) return;
    const f = (await this.profiles.friends(p.pid)).find(f => f.id === t.id);
    if (!f || f.status !== 'friend') return this.notice(p, 'You can only message friends');
    const now = Date.now();
    p.dmTimes = (p.dmTimes || []).filter(t => now - t < 5000);
    if (p.dmTimes.length >= 5) return this.notice(p, 'Slow down — too many messages');
    p.dmTimes.push(now);
    const payload = { type: 'dm', from: p.name, username: p.username, to: f.username, text, self: false };
    const mine = { ...payload, self: true };
    this.send(p, mine);
    const conns = [...(this.online.get(t.id) || [])];
    if (!conns.length) return this.notice(p, `${f.name} is offline`);
    for (const c of conns) this.send(c, payload);
  },
};
