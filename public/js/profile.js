// Your profile lives in this browser: a random secret token (your identity, no password)
// and a display name. The server keeps the stats; see server/profiles.js.
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export function token() {
  let t = get('shooty.token');
  if (!t) {
    // getRandomValues works on plain http too (randomUUID needs https or localhost)
    t = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    set('shooty.token', t);
  }
  return t;
}

export const setToken = t => set('shooty.token', t);
export const clearToken = () => { try { localStorage.removeItem('shooty.token'); } catch {} };

export const savedName = () => get('shooty.name') || '';
export const saveName = name => set('shooty.name', name);
