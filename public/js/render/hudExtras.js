// HUD for the newer modes and toys, drawn over the 3D view like render/hud.js: monster health
// bars and names, emote bubbles, the emote wheel, meteor and gravity-well rings on the ground,
// the map event's screen tint and the Crypt's shop labels.
import { BODY_H, MOBS, EMOTES, METEOR, WELL, MAP_EVENTS, SURVIVAL } from '/shared/config.js';
import { cryptLayout, isSurvivalLevel } from '/shared/crypt.js';
import { S, nameOf, isEnemy } from '../state.js';
import { EMOTE_LOOK, SPELL_LOOK } from '../constants.js';
import { ctx, view } from './canvas.js';
import { project, occluded } from './world.js';
import { settings, keyName } from '../settings.js';


// a ring on the ground (x, y at height z), broken where it goes behind you
function groundRing(x, y, z, r, style, width = 2.5) {
  ctx.strokeStyle = style; ctx.lineWidth = width;
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * Math.PI * 2, q = project(x + Math.cos(a) * r, y + Math.sin(a) * r, z + 0.05);
    if (q.f < 0.15) { pen = false; continue; }
    if (pen) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    pen = true;
  }
  ctx.stroke();
}

// health bars over hurt monsters (always over bosses), names over decoys
export function drawNpcTags() {
  ctx.textAlign = 'center';
  for (const o of Object.values(S.npcs)) {
    const e = o.now;
    if (!e) continue;
    const def = MOBS[e.k], big = def?.big || 1;
    const p = project(e.x, e.y, e.z + BODY_H * big + 0.25);
    if (p.f < 0.4 || p.f > 22 || occluded(p)) continue;
    if (e.k === 'decoy') { // looks just like its caster
      ctx.font = 'bold ' + Math.round(Math.max(11, Math.min(16, 40 / p.f + 9))) + 'px Courier New';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(nameOf(e.o), p.x + 1, p.y + 1);
      ctx.fillStyle = isEnemy(e.o) ? '#b05050' : '#9a78b8'; ctx.fillText(nameOf(e.o), p.x, p.y);
      continue;
    }
    if (!def.boss && e.hp >= e.mhp) continue;
    const w = Math.max(26, Math.min(90, 70 / p.f * big)), k = Math.max(0, e.hp / e.mhp);
    ctx.fillStyle = 'rgba(20,8,8,0.75)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6);
    ctx.fillStyle = def.boss ? '#c02040' : '#d06030'; ctx.fillRect(p.x - w / 2, p.y, w * k, 4);
    if (def.boss) {
      ctx.font = '700 13px Caslon Antique, Georgia, serif';
      ctx.fillStyle = '#ffd0d8'; ctx.fillText(def.name.toUpperCase(), p.x, p.y - 6);
    }
  }
  ctx.textAlign = 'left';
}

// what someone is emoting, in a bubble over their head
export function drawEmoteBubbles(now) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [id, e] of Object.entries(S.emotes)) {
    if (now - e.t > e.ms) { delete S.emotes[id]; continue; }
    const k = Math.min(1, (now - e.t) / 150), fade = Math.min(1, (e.ms - (now - e.t)) / 300);
    let p;
    if (+id === S.myId) p = { x: view.W / 2, y: view.H * 0.62, f: 3 }; // yours, under the crosshair
    else {
      const o = S.others[id]?.now;
      if (!o || o.dead) continue;
      p = project(o.x, o.y, o.z + BODY_H + 0.55);
      if (p.f < 0.4 || p.f > 20 || occluded(p)) continue;
    }
    const size = Math.max(18, Math.min(38, 60 / p.f + 12)) * (0.6 + 0.4 * k);
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(250,240,215,0.92)'; ctx.strokeStyle = '#5a3820'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = Math.round(size) + 'px serif'; ctx.fillStyle = '#000';
    ctx.fillText(EMOTE_LOOK[e.emote] || '?', p.x, p.y + 1);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// the emote wheel: pick one with its number key (or click it)
export const wheelSlots = [];
export function drawEmoteWheel() {
  wheelSlots.length = 0;
  if (!S.emoteWheel) return;
  const { W, H } = view, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.2;
  ctx.fillStyle = 'rgba(20,12,18,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  EMOTES.forEach((e, i) => {
    const a = -Math.PI / 2 + i / EMOTES.length * Math.PI * 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    wheelSlots.push({ x, y, r: 34, emote: e });
    const on = S.wheelPick === e;
    ctx.fillStyle = on ? 'rgba(255,240,190,1)' : 'rgba(245,232,200,0.9)'; ctx.strokeStyle = on ? '#c9a24a' : '#5a3820'; ctx.lineWidth = on ? 4 : 2;
    ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '26px serif'; ctx.fillStyle = '#000'; ctx.fillText(EMOTE_LOOK[e], x, y - 4);
    ctx.font = '700 10px Caslon Antique, Georgia, serif'; ctx.fillStyle = '#5a2a90';
    ctx.fillText(`${i + 1} ${e.toUpperCase()}`, x, y + 22);
  });
  ctx.font = '700 14px Caslon Antique, Georgia, serif'; ctx.fillStyle = '#f0e0b8';
  ctx.fillText(`EMOTE · 1-8 or click · ${keyName(settings.keys.emote)} closes`, cx, cy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// meteor strike zones and gravity wells, as rings on the ground
export function drawGroundWarnings(now) {
  S.meteors = S.meteors.filter(m => now < m.at + 200);
  for (const m of S.meteors) {
    const k = Math.min(1, (now - m.t) / (m.at - m.t)), blink = 0.5 + 0.5 * Math.sin(now / (30 + 90 * (1 - k)));
    groundRing(m.x, m.y, m.z, METEOR.radius, `rgba(255,${120 - 80 * k | 0},40,${0.4 + 0.5 * blink})`, 3);
    groundRing(m.x, m.y, m.z, METEOR.radius * k, 'rgba(255,200,80,0.6)', 2);
  }
  for (const w of S.wells) {
    if (now > w.until) continue;
    const spin = (now / 300) % 1;
    groundRing(w.x, w.y, 0, WELL.radius, `rgba(${SPELL_LOOK.well.col.join(',')},0.7)`, 2.5);
    groundRing(w.x, w.y, 0, WELL.radius * (1 - spin), `rgba(${SPELL_LOOK.well.col.join(',')},${0.3 + 0.5 * spin})`, 2);
  }
}

// the Blood Moon's red haze, a frost rim when you're rooted
export function drawEventTint(now) {
  const { W, H } = view;
  const tint = (rgb, a) => {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, `rgba(${rgb},0)`); v.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  };
  if (S.event === 'bloodmoon' && now < S.eventEndsAt) tint('150,0,20', 0.35 + 0.05 * Math.sin(now / 400));
  if (S.frozenUntil > now) tint('150,220,255', 0.5);
  if (S.furyUntil > now) tint('255,60,40', 0.18);
  if (S.event && now < S.eventEndsAt && !S.dead) {
    const left = Math.ceil((S.eventEndsAt - now) / 1000);
    ctx.font = '700 14px Caslon Antique, Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillStyle = S.event === 'bloodmoon' ? '#ff7080' : '#e8d8ff';
    ctx.fillText(`${MAP_EVENTS[S.event].name} · ${left}s`, W / 2, 26);
    ctx.textAlign = 'left';
  }
}

// labels on the Crypt's closed doors and shops within a few steps
export function drawShopLabels() {
  if (!S.survival || !isSurvivalLevel(S.level) || !S.me) return;
  const L = cryptLayout(S.MAP), me = S.me;
  ctx.textAlign = 'center';
  const label = (x, y, z, text, cost) => {
    if (Math.hypot(me.x - x, me.y - y) > 7) return;
    const p = project(x, y, z);
    if (p.f < 0.3 || occluded(p)) return;
    ctx.font = '700 13px Caslon Antique, Georgia, serif';
    const t = `${text} · ${cost}g`, w = ctx.measureText(t).width + 14;
    ctx.fillStyle = 'rgba(20,12,18,0.7)'; ctx.fillRect(p.x - w / 2, p.y - 11, w, 18);
    ctx.fillStyle = S.gold >= cost ? '#f2c85a' : '#b07070'; ctx.fillText(t, p.x, p.y + 3);
  };
  for (const d of L.doors) if (!S.openDoors.has(d.id)) label(d.x, d.y, 1.9, d.name, d.cost);
  for (const b of L.buys) label(b.x + b.wx * 0.38, b.y + b.wy * 0.38, 1.35, b.w.toUpperCase(), b.cost);
  for (const e of L.elixirs) if (!S.elixirs?.[e.elixir]) label(e.x, e.y, 1.1, e.name, e.cost);
  for (const u of L.supplies) label(u.x, u.y, 1.1, u.name, u.cost);
  for (const c of L.boxes) label(c.x, c.y, 1.5, 'Mystery Cauldron', SURVIVAL.boxCost);
  ctx.textAlign = 'left';
}
