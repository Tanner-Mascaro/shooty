// Saved player profiles: a display name, lifetime stats and game settings, optionally claimed with a
// username + password so the same profile works on any device.
//
// Identity is a secret token the browser keeps (public/js/profile.js). Only hashes of tokens
// are stored. A brand-new browser's profile id is the hash of its token; signing in on another
// browser adds a session (that browser's token hash -> the account's profile id).
//
// With DATABASE_URL set (e.g. Render + a free Neon Postgres) everything lives in Postgres;
// otherwise in data/profiles.json, which is fine locally but is wiped whenever Render
// redeploys or restarts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { log } from './log.js';

export const STATS = ['kills', 'deaths', 'wins', 'losses'];
const BOARD_SIZE = 10;
const MAX_FRIENDS = 100; // friends + pending requests per player

export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
export const newToken = () => crypto.randomBytes(24).toString('hex');

// passwords: scrypt with a random salt, stored as "salt:hash"
const scrypt = promisify(crypto.scrypt);
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}
export async function checkPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const got = await scrypt(password, salt, 64), want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// leaderboard order: most wins, then most kills, then fewest deaths; only players with a finished match
const ranked = p => p.wins + p.losses > 0;
const ahead = (a, b) => a.wins - b.wins || a.kills - b.kills || b.deaths - a.deaths;

export async function openProfiles(root) {
  return process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : fileStore(path.join(root, 'data', 'profiles.json'));
}

// Both stores have the same methods:
//   resolve(tokenHash)       -> profile id for this browser (a session's account, else the token's own profile)
//   load(id, name, fallback) -> { name, username, settings, kills, ... }; creates the profile (named
//                               `fallback` if no name), renames it if a name is given
//   add(id, { kills: 1 })    -> bumps stats
//   saveSettings(id, obj)    -> stores the player's game settings (public/js/settings.js; null until saved)
//   claim(id, username, passHash) -> false if the username is taken or the profile already has one
//   account(username)        -> { id, passHash } or null
//   addSession(tokenHash, id) / removeSession(tokenHash)
//   board()                  -> top players [{ name, kills, deaths, wins, losses }]
//   rank(stats)              -> 1-based leaderboard position for these stats, or null if unranked
//   friendRequest(from, to)  -> 'sent' | 'accepted' (they'd already asked you) | 'already' | 'limit'
//   friendAccept(me, from)   -> false if there was no such request
//   friendRemove(x, y)       -> unfriend / decline / cancel, either direction
//   friends(id)              -> [{ id, name, username, status: 'friend' | 'incoming' | 'outgoing' }]
async function postgresStore(url) {
  const { default: pg } = await import('pg');
  const db = new pg.Pool({ connectionString: url, max: 3 });
  db.on('error', e => log('Database error: ' + e.message)); // idle connection dropped; the pool reconnects
  await db.query(`CREATE TABLE IF NOT EXISTS profiles (
    id text PRIMARY KEY, name text NOT NULL,
    kills int NOT NULL DEFAULT 0, deaths int NOT NULL DEFAULT 0, wins int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now())`);
  await db.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text, ADD COLUMN IF NOT EXISTS pass_hash text`);
  await db.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings jsonb`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS profiles_username ON profiles (lower(username))`);
  await db.query(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY, profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS friends (
    a text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, b text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (a, b))`); // a asked b
  log('Profiles: Postgres');
  const one = async (sql, args) => (await db.query(sql, args)).rows[0];
  return {
    async resolve(tokenHash) {
      const s = await one('SELECT profile_id FROM sessions WHERE token_hash = $1', [tokenHash]);
      return s ? s.profile_id : tokenHash;
    },
    async load(id, name, fallback) {
      return one(`INSERT INTO profiles (id, name) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET name = COALESCE($3, profiles.name), last_seen = now()
        RETURNING name, username, settings, ${STATS.join(', ')}`, [id, name || fallback, name || null]);
    },
    async add(id, delta) {
      await db.query(`UPDATE profiles SET ${STATS.map((s, i) => `${s} = ${s} + $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...STATS.map(s => delta[s] || 0)]);
    },
    async saveSettings(id, settings) { await db.query('UPDATE profiles SET settings = $2 WHERE id = $1', [id, JSON.stringify(settings)]); },
    async claim(id, username, passHash) {
      try {
        const r = await db.query('UPDATE profiles SET username = $2, pass_hash = $3 WHERE id = $1 AND username IS NULL', [id, username, passHash]);
        return r.rowCount === 1;
      } catch (e) { if (e.code === '23505') return false; throw e; } // unique violation: name taken
    },
    async account(username) {
      const r = await one('SELECT id, pass_hash FROM profiles WHERE lower(username) = lower($1)', [username]);
      return r ? { id: r.id, passHash: r.pass_hash } : null;
    },
    async addSession(tokenHash, id) {
      await db.query('INSERT INTO sessions (token_hash, profile_id) VALUES ($1, $2) ON CONFLICT (token_hash) DO UPDATE SET profile_id = $2', [tokenHash, id]);
    },
    async removeSession(tokenHash) { await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]); },
    async board() {
      return (await db.query(`SELECT name, ${STATS.join(', ')} FROM profiles WHERE wins + losses > 0
        ORDER BY wins DESC, kills DESC, deaths ASC LIMIT ${BOARD_SIZE}`)).rows;
    },
    async rank(s) {
      if (!ranked(s)) return null;
      const r = await one(`SELECT count(*)::int + 1 AS rank FROM profiles WHERE wins + losses > 0 AND
        (wins > $1 OR (wins = $1 AND (kills > $2 OR (kills = $2 AND deaths < $3))))`, [s.wins, s.kills, s.deaths]);
      return r.rank;
    },
    async friendRequest(from, to) {
      const rev = await one('SELECT accepted FROM friends WHERE a = $1 AND b = $2', [to, from]);
      if (rev) {
        if (rev.accepted) return 'already';
        await db.query('UPDATE friends SET accepted = true WHERE a = $1 AND b = $2', [to, from]);
        return 'accepted';
      }
      if ((await one('SELECT count(*)::int AS n FROM friends WHERE a = $1 OR b = $1', [from])).n >= MAX_FRIENDS) return 'limit';
      const r = await db.query('INSERT INTO friends (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING', [from, to]);
      return r.rowCount ? 'sent' : 'already';
    },
    async friendAccept(me, from) {
      return (await db.query('UPDATE friends SET accepted = true WHERE a = $1 AND b = $2', [from, me])).rowCount === 1;
    },
    async friendRemove(x, y) { await db.query('DELETE FROM friends WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)', [x, y]); },
    async friends(id) {
      const rows = (await db.query(`SELECT f.a, f.accepted, p.id, p.name, p.username FROM friends f
        JOIN profiles p ON p.id = CASE WHEN f.a = $1 THEN f.b ELSE f.a END
        WHERE f.a = $1 OR f.b = $1 ORDER BY lower(p.name)`, [id])).rows;
      return rows.map(r => ({ id: r.id, name: r.name, username: r.username, status: r.accepted ? 'friend' : r.a === id ? 'outgoing' : 'incoming' }));
    },
  };
}

function fileStore(file) {
  let data = { profiles: {}, sessions: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = raw.profiles ? raw : { profiles: raw, sessions: {} }; // older files were just the profiles map
  } catch {}
  data.friends ??= []; // [{ a, b, accepted }]: a asked b
  const all = data.profiles;
  let saving = null;
  const save = () => { // coalesce bursts of changes into one write
    saving ??= setTimeout(() => {
      saving = null;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFile(file, JSON.stringify(data, null, 1), e => e && log('Could not save profiles: ' + e.message));
    }, 500);
  };
  const pick = p => ({ name: p.name, username: p.username || null, ...Object.fromEntries(STATS.map(s => [s, p[s]])) });
  log(`Profiles: ${path.relative(process.cwd(), file)} (set DATABASE_URL to use Postgres)`);
  return {
    async resolve(tokenHash) { return data.sessions[tokenHash] || tokenHash; },
    async load(id, name, fallback) {
      const p = all[id] ??= { name: name || fallback, kills: 0, deaths: 0, wins: 0, losses: 0, created: new Date().toISOString() };
      if (name) p.name = name;
      p.lastSeen = new Date().toISOString();
      save();
      return { ...pick(p), settings: p.settings || null };
    },
    async saveSettings(id, settings) { if (all[id]) { all[id].settings = settings; save(); } },
    async add(id, delta) {
      if (!all[id]) return;
      for (const s of STATS) all[id][s] += delta[s] || 0;
      save();
    },
    async claim(id, username, passHash) {
      const lower = username.toLowerCase();
      if (!all[id] || all[id].username || Object.values(all).some(p => p.username && p.username.toLowerCase() === lower)) return false;
      Object.assign(all[id], { username, passHash });
      save();
      return true;
    },
    async account(username) {
      const lower = username.toLowerCase();
      const id = Object.keys(all).find(k => all[k].username && all[k].username.toLowerCase() === lower);
      return id ? { id, passHash: all[id].passHash } : null;
    },
    async addSession(tokenHash, id) { data.sessions[tokenHash] = id; save(); },
    async removeSession(tokenHash) { delete data.sessions[tokenHash]; save(); },
    async board() { return Object.values(all).filter(ranked).sort((a, b) => ahead(b, a)).slice(0, BOARD_SIZE).map(pick).map(({ username, ...p }) => p); },
    async rank(s) { return ranked(s) ? 1 + Object.values(all).filter(p => ranked(p) && ahead(p, s) > 0).length : null; },
    async friendRequest(from, to) {
      const rev = data.friends.find(f => f.a === to && f.b === from);
      if (rev) { if (rev.accepted) return 'already'; rev.accepted = true; save(); return 'accepted'; }
      if (data.friends.some(f => f.a === from && f.b === to)) return 'already';
      if (data.friends.filter(f => f.a === from || f.b === from).length >= MAX_FRIENDS) return 'limit';
      data.friends.push({ a: from, b: to, accepted: false }); save();
      return 'sent';
    },
    async friendAccept(me, from) {
      const f = data.friends.find(f => f.a === from && f.b === me);
      if (!f) return false;
      f.accepted = true; save();
      return true;
    },
    async friendRemove(x, y) { data.friends = data.friends.filter(f => !((f.a === x && f.b === y) || (f.a === y && f.b === x))); save(); },
    async friends(id) {
      return data.friends.filter(f => (f.a === id || f.b === id) && all[f.a === id ? f.b : f.a]).map(f => {
        const oid = f.a === id ? f.b : f.a, o = all[oid];
        return { id: oid, name: o.name, username: o.username || null, status: f.accepted ? 'friend' : f.a === id ? 'outgoing' : 'incoming' };
      }).sort((x, y) => x.name.toLowerCase().localeCompare(y.name.toLowerCase()));
    },
  };
}
