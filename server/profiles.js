// Saved player profiles: a display name plus lifetime stats, keyed by a secret token the
// browser generates and keeps (public/js/profile.js). Only a hash of the token is stored.
//
// With DATABASE_URL set (e.g. Render + a free Neon or Supabase Postgres) profiles live in
// Postgres; otherwise in data/profiles.json, which is fine locally but is wiped whenever
// Render redeploys or restarts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './log.js';

export const STATS = ['kills', 'deaths', 'wins', 'losses'];

export const profileId = token => crypto.createHash('sha256').update(token).digest('hex');

export async function openProfiles(root) {
  return process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : fileStore(path.join(root, 'data', 'profiles.json'));
}

// both stores: load(id, name) creates or renames a profile and returns { name, kills, ... };
// add(id, { kills: 1, ... }) bumps stats
async function postgresStore(url) {
  const { default: pg } = await import('pg');
  const db = new pg.Pool({ connectionString: url, max: 3 });
  db.on('error', e => log('Database error: ' + e.message)); // idle connection dropped; the pool reconnects
  await db.query(`CREATE TABLE IF NOT EXISTS profiles (
    id text PRIMARY KEY, name text NOT NULL,
    kills int NOT NULL DEFAULT 0, deaths int NOT NULL DEFAULT 0, wins int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now())`);
  log('Profiles: Postgres');
  return {
    async load(id, name) {
      const r = await db.query(`INSERT INTO profiles (id, name) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, last_seen = now()
        RETURNING name, ${STATS.join(', ')}`, [id, name]);
      return r.rows[0];
    },
    async add(id, delta) {
      await db.query(`UPDATE profiles SET ${STATS.map((s, i) => `${s} = ${s} + $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...STATS.map(s => delta[s] || 0)]);
    },
  };
}

function fileStore(file) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let saving = null;
  const save = () => { // coalesce bursts of changes into one write
    saving ??= setTimeout(() => {
      saving = null;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFile(file, JSON.stringify(all, null, 1), e => e && log('Could not save profiles: ' + e.message));
    }, 500);
  };
  log(`Profiles: ${path.relative(process.cwd(), file)} (set DATABASE_URL to use Postgres)`);
  return {
    async load(id, name) {
      const p = all[id] ??= { kills: 0, deaths: 0, wins: 0, losses: 0, created: new Date().toISOString() };
      p.name = name; p.lastSeen = new Date().toISOString();
      save();
      return { name, ...Object.fromEntries(STATS.map(s => [s, p[s]])) };
    },
    async add(id, delta) {
      if (!all[id]) return;
      for (const s of STATS) all[id][s] += delta[s] || 0;
      save();
    },
  };
}
