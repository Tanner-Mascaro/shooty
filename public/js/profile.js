import { PLAYER_SKINS } from '/shared/config.js';

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
export const savedSkin = () => {
  const s = get('shooty.skin');
  return PLAYER_SKINS.includes(s) ? s : 'witch';
};
// your title and kill effect (the server checks your level has them)
export const savedTitle = () => get('shooty.title') || 'apprentice';
export const savedEffect = () => get('shooty.effect') || 'blood';
export const saveLook = (title, effect) => { set('shooty.title', title); set('shooty.effect', effect); };
export const saveSkin = skin => set('shooty.skin', PLAYER_SKINS.includes(skin) ? skin : 'witch');

// set once you sign in or continue as a guest; the sign-in screen is skipped from then on
export const hasEntered = () => !!get('shooty.entered');
export const setEntered = on => { try { on ? localStorage.setItem('shooty.entered', '1') : localStorage.removeItem('shooty.entered'); } catch {} };
