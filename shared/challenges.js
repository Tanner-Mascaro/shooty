// Daily and weekly challenges. Everyone gets the same ones on a given day / week (picked from
// the pools by a seed from the date), the server counts progress and pays out the XP.
//
// Progress comes from events the server reports:
//   { type: 'kill', weapon, head, backstab, streak }   { type: 'match' }   { type: 'win', mode }
//   { type: 'cast' }   { type: 'capture' }

const SNIPES = ['sniper', 'crossbow', 'beam', 'marksman', 'dragon', 'dmr'];

export const DAILY = [
  { id: 'kills10', text: 'Get 10 kills', goal: 10, xp: 60, on: e => e.type === 'kill' },
  { id: 'heads5', text: 'Land 5 headshot kills', goal: 5, xp: 70, on: e => e.type === 'kill' && e.head },
  { id: 'play3', text: 'Finish 3 matches', goal: 3, xp: 50, on: e => e.type === 'match' },
  { id: 'win1', text: 'Win a match', goal: 1, xp: 70, on: e => e.type === 'win' },
  { id: 'blade3', text: 'Get 3 blade kills', goal: 3, xp: 70, on: e => e.type === 'kill' && e.weapon === 'blade' },
  { id: 'potion2', text: 'Get 2 potion kills', goal: 2, xp: 70, on: e => e.type === 'kill' && e.weapon === 'nade' },
  { id: 'cast3', text: 'Drink 3 spell potions', goal: 3, xp: 50, on: e => e.type === 'cast' },
  { id: 'streak3', text: 'Get a 3-kill streak', goal: 1, xp: 60, on: e => e.type === 'kill' && e.streak >= 3 },
  { id: 'snipe3', text: 'Get 3 kills with a sniper or beam rifle', goal: 3, xp: 60, on: e => e.type === 'kill' && SNIPES.includes(e.weapon) },
  { id: 'wand3', text: 'Get 3 kills with the Hex Wand', goal: 3, xp: 70, on: e => e.type === 'kill' && e.weapon === 'wand' },
];

export const WEEKLY = [
  { id: 'kills75', text: 'Get 75 kills', goal: 75, xp: 300, on: e => e.type === 'kill' },
  { id: 'wins10', text: 'Win 10 matches', goal: 10, xp: 350, on: e => e.type === 'win' },
  { id: 'play20', text: 'Finish 20 matches', goal: 20, xp: 250, on: e => e.type === 'match' },
  { id: 'heads30', text: 'Land 30 headshot kills', goal: 30, xp: 300, on: e => e.type === 'kill' && e.head },
  { id: 'plague2', text: 'Win 2 rounds of Plague', goal: 2, xp: 250, on: e => e.type === 'win' && e.mode === 'plague' },
  { id: 'capture3', text: 'Capture 3 cauldrons', goal: 3, xp: 300, on: e => e.type === 'capture' },
  { id: 'modes4', text: 'Win in 4 different modes', goal: 4, xp: 400, on: e => e.type === 'win', distinct: e => e.mode },
];

export const DAILY_COUNT = 3, WEEKLY_COUNT = 2;
const ALL = Object.fromEntries([...DAILY, ...WEEKLY].map(c => [c.id, c]));
export const challengeById = id => ALL[id];

// which day / week it is (UTC), as keys for storage and seeds
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const weekKey = (t = Date.now()) => {
  const d = new Date(t), day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return 'w' + monday.toISOString().slice(0, 10);
};
// ms until the next daily / weekly reset
export const untilDayEnds = (t = Date.now()) => 86400000 - t % 86400000;
export const untilWeekEnds = (t = Date.now()) => {
  const d = new Date(t), day = (d.getUTCDay() + 6) % 7;
  return (7 - day) * 86400000 - t % 86400000;
};

// n different picks from a pool, the same for everyone with the same key
function pick(pool, n, key) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h / 4294967296; };
  const list = pool.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, n).map(c => c.id);
}
export const dailyIds = (t = Date.now()) => pick(DAILY, DAILY_COUNT, 'd' + dayKey(t));
export const weeklyIds = (t = Date.now()) => pick(WEEKLY, WEEKLY_COUNT, weekKey(t));

// a player's saved challenge state, rolled over to the current day / week:
// { day, daily: { id: count }, week, weekly: { id: count or [distinct values] }, done: [ids] }
export function currentChallenges(saved, t = Date.now()) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const day = dayKey(t), week = weekKey(t);
  const fresh = (ids, old, same) => Object.fromEntries(ids.map(id => [id, same && old && old[id] !== undefined ? old[id] : 0]));
  const sameDay = s.day === day, sameWeek = s.week === week;
  return {
    day, week,
    daily: fresh(dailyIds(t), s.daily, sameDay),
    weekly: fresh(weeklyIds(t), s.weekly, sameWeek),
    done: (Array.isArray(s.done) ? s.done : []).filter(k => k.startsWith(day + ':') || k.startsWith(week + ':')),
  };
}

// count an event; returns the challenges it just completed (they pay out once)
export function countEvent(state, e) {
  const finished = [];
  for (const [bucket, period] of [['daily', state.day], ['weekly', state.week]]) {
    for (const id of Object.keys(state[bucket])) {
      const c = ALL[id], key = period + ':' + id;
      if (!c || state.done.includes(key) || !c.on(e)) continue;
      if (c.distinct) {
        const seen = Array.isArray(state[bucket][id]) ? state[bucket][id] : [];
        const v = c.distinct(e);
        if (!seen.includes(v)) seen.push(v);
        state[bucket][id] = seen;
      } else state[bucket][id] = (state[bucket][id] || 0) + 1;
      if (progressOf(state[bucket][id]) >= c.goal) { state.done.push(key); finished.push(c); }
    }
  }
  return finished;
}

export const progressOf = v => Array.isArray(v) ? v.length : v || 0;

// what the browser shows: [{ id, text, goal, n, xp, done }] per bucket, plus reset timers
export function challengeView(state, t = Date.now()) {
  const view = (bucket, period) => Object.keys(state[bucket]).map(id => {
    const c = ALL[id];
    return { id, text: c.text, goal: c.goal, xp: c.xp, n: Math.min(c.goal, progressOf(state[bucket][id])), done: state.done.includes(period + ':' + id) };
  });
  return { daily: view('daily', state.day), weekly: view('weekly', state.week), dayMs: untilDayEnds(t), weekMs: untilWeekEnds(t) };
}
