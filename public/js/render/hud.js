// Everything drawn at full resolution on top of the 3D view: tracers, glows, the gun,
// crosshair / scope, hit markers, screen flashes, banner, minimap and weapon list.
import { MW, MH } from '/shared/levels.js';
import { WEAPONS, AMMO, WEAPON_ORDER, EYE, BODY_H } from '/shared/config.js';
import { S, owned, isEnemy, nameOf } from '../state.js';
import { BASE_FOV, MAX_SPEED, GUN_COLOR } from '../constants.js';
import { ctx, view } from './canvas.js';
import { project, occluded } from './world.js';
import { mini } from '../level.js';
import { inPit } from '../physics.js';

export function glow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function drawTracers(now) {
  S.tracers = S.tracers.filter(t => now - t.t < (t.weapon === 'sniper' ? 1500 : 90));
  const c = S.cam, me = S.me, near = 0.1;
  const lerp = (p, q, u) => ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u });
  const line = (A, B, style, width) => { ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); };
  ctx.lineCap = 'round';
  for (const t of S.tracers) {
    let a = { x: t.x0, y: t.y0, z: t.z0 }, b = { x: t.x1, y: t.y1, z: t.z1 };
    if (t.mine) { a.x -= Math.sin(me.a) * 0.15; a.y += Math.cos(me.a) * 0.15; } // from the gun, right of center
    // clip against the near plane
    const fa = (a.x - me.x) * c.fwdx + (a.y - me.y) * c.fwdy, fb = (b.x - me.x) * c.fwdx + (b.y - me.y) * c.fwdy;
    if (fa < near && fb < near) continue;
    if (fa < near) a = lerp(a, b, (near - fa) / (fb - fa));
    else if (fb < near) b = lerp(a, b, (near - fa) / (fb - fa));
    const A = project(a.x, a.y, a.z), B = project(b.x, b.y, b.z), age = now - t.t;
    if (t.weapon === 'sniper') {
      const k = 1 - age / 1500, hot = Math.max(0, 1 - age / 250);
      line(A, B, 'rgba(120,110,110,' + (k * 0.35) + ')', 3 + age / 60); // lingering smoke trail
      if (hot > 0) {
        line(A, B, 'rgba(' + S.theme.accent + ',' + (hot * 0.6) + ')', 7);
        line(A, B, 'rgba(255,240,220,' + hot + ')', 2);
      }
    } else line(A, B, 'rgba(255,210,120,' + (0.7 * (1 - age / 90)) + ')', 1.5);
  }
}

// glowing pads under pickups
export function drawPickupGlows() {
  S.pickupSpots.forEach((p, i) => {
    const q = project(p.x, p.y, 0.05);
    if (q.f < 0.3 || occluded(q)) return;
    const on = S.pickupActive[i];
    glow(q.x, q.y, (on ? 260 : 120) / q.f, 'rgba(' + GUN_COLOR[p.weapon].join(',') + ',' + (on ? 0.45 : 0.15) + ')');
  });
}

// other players' muzzle flashes and scope glints (only if not behind a wall)
export function drawEnemyGlows(now) {
  for (const o of Object.values(S.others)) {
    const e = o.now;
    if (!e) continue;
    if (now - o.flashT < 70) {
      const p = project(e.x, e.y, e.z + EYE - 0.1);
      if (p.f > 0.2 && !occluded(p)) glow(p.x, p.y, 160 / p.f + 20, 'rgba(255,210,90,0.9)');
    }
    if (e.sc) {
      const p = project(e.x, e.y, e.z + EYE);
      if (p.f > 0.2 && !occluded(p)) glow(p.x, p.y, 18 + 8 * Math.sin(now / 120), 'rgba(255,240,230,0.9)');
    }
  }
}

// names over heads: teammates always (blue), enemies red when in sight and not too far
export function drawNameTags() {
  ctx.textAlign = 'center';
  for (const [id, o] of Object.entries(S.others)) {
    const e = o.now;
    if (!e) continue;
    const enemy = isEnemy(+id), p = project(e.x, e.y, e.z + BODY_H + 0.3);
    if (p.f < 0.4 || (enemy && (p.f > 18 || occluded(p)))) continue;
    ctx.font = 'bold ' + Math.round(Math.max(11, Math.min(16, 40 / p.f + 9))) + 'px Courier New';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(nameOf(+id), p.x + 1, p.y + 1);
    ctx.fillStyle = enemy ? '#ff6655' : '#66aaff';
    ctx.fillText(nameOf(+id), p.x, p.y);
  }
  ctx.textAlign = 'left';
}

function drawScope() {
  const { W, H } = view, cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.45;
  const lens = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
  lens.addColorStop(0, 'rgba(0,0,0,0)'); lens.addColorStop(1, 'rgba(' + S.theme.accent + ',0.25)');
  ctx.fillStyle = lens; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill('evenodd');
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); // thick posts
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.35, cy); ctx.moveTo(cx + r * 0.35, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy + r * 0.35); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.fillStyle = '#000';
  for (let i = 1; i <= 4; i++) { const d = r * 0.07 * i; ctx.fillRect(cx - d - 1.5, cy - 1.5, 3, 3); ctx.fillRect(cx + d - 1.5, cy - 1.5, 3, 3); ctx.fillRect(cx - 1.5, cy + d - 1.5, 3, 3); }
  ctx.fillStyle = '#f22'; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
}

// crosshair per weapon; the rifle/SMG gap opens in the air and on recoil
function drawCrosshair() {
  const cx = view.W / 2, cy = view.H / 2, w = S.weapon;
  if (w === 'blade') {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
  } else if (w === 'shotgun') {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 22 + S.recoil * 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
  } else if (w === 'sniper') { // no crosshair unscoped, like CS
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
  } else {
    const g = 4 + (S.onGround ? 0 : 8) + S.recoil * 10, l = 8;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(cx - g - l, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + l, cy);
    ctx.moveTo(cx, cy - g - l); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + l); ctx.stroke();
  }
}

// --- first-person weapon models ---
// Drawn in a local frame anchored at the bottom-right of the screen and rotated so -y points
// toward the crosshair; y=0 is the near end, y=-L the muzzle. Widths taper for perspective.
function seg(L, y0, y1, hw0, hw1, xo, fill) {
  const k = y => 1 - 0.45 * Math.min(1, Math.max(0, -y / L));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo((xo - hw0) * k(y0), y0); ctx.lineTo((xo - hw1) * k(y1), y1);
  ctx.lineTo((xo + hw1) * k(y1), y1); ctx.lineTo((xo + hw0) * k(y0), y0);
  ctx.closePath(); ctx.fill();
}

const GUN_LEN = { rifle: 34, sniper: 42, shotgun: 30, smg: 27, blade: 30 };

const MODELS = {
  blade(L, now, c) {
    const p = Math.min(1, (now - S.swingT) / 250), sw = p < 1 ? Math.sin(p * Math.PI) : 0;
    ctx.rotate(-sw * 1.4); ctx.translate(-sw * 10, -sw * 4);
    seg(L, 3, -9, 2.2, 2, 0, c.dark);    // grip
    seg(L, -9, -11, 5, 4.6, 0, c.light); // guard
    ctx.fillStyle = c.mid;               // jagged blade
    ctx.beginPath(); ctx.moveTo(-2.2, -11); ctx.lineTo(-2.6, -20); ctx.lineTo(-1, -23); ctx.lineTo(-1.8, -27); ctx.lineTo(0.3, -L);
    ctx.lineTo(1.6, -26); ctx.lineTo(1, -22); ctx.lineTo(1.8, -16); ctx.lineTo(2, -11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.glow; ctx.lineWidth = 0.35; ctx.stroke();
  },
  rifle(L, now, c) {
    seg(L, 3, -14, 5.4, 4.4, 0, c.mid);    // receiver
    seg(L, -7, -13, 2.2, 2, -5.6, c.dark);  // magazine
    seg(L, -14, -26, 3.4, 2.8, 0, c.dark);  // handguard
    seg(L, -26, -L, 1.3, 1.1, 0, '#111');   // barrel
    seg(L, -10, -13, 1.2, 1.1, 0, c.light); // rear sight
    seg(L, 1, -24, 0.7, 0.6, 1.6, c.glow);  // accent strip
  },
  smg(L, now, c) {
    seg(L, 3, -13, 4.6, 4, 0, c.mid);
    seg(L, -5, -14, 1.8, 1.7, -5.2, c.dark); // long mag
    seg(L, -13, -20, 3, 2.6, 0, c.dark);
    seg(L, -20, -L, 1.2, 1, 0, '#111');
    seg(L, 0, -18, 0.6, 0.5, 1.4, c.glow);
  },
  shotgun(L, now, c) {
    const pump = Math.max(0, 1 - Math.abs(now - S.fireT - 450) / 200) * 4; // slides back after a shot
    seg(L, 3, -12, 5.8, 5, 0, c.mid);
    seg(L, -12, -L, 1.6, 1.3, -1.5, '#111'); // twin barrels
    seg(L, -12, -L, 1.6, 1.3, 1.5, '#111');
    seg(L, -13 + pump, -21 + pump, 3.8, 3.3, 0, c.light);
    seg(L, 1, -11, 0.7, 0.6, 2.5, c.glow);
  },
  sniper(L, now, c) {
    const bp = now - S.fireT - 450, bolt = bp > 0 && bp < 400 ? Math.sin(bp / 400 * Math.PI) * 4 : 0;
    seg(L, 3, -12, 5, 4.4, 0, c.mid);          // stock + receiver
    seg(L, -12, -20, 3.4, 3, 0, c.dark);
    seg(L, -20, -L, 1.2, 0.9, 0, '#111');      // long barrel
    seg(L, -8, -24, 2.5, 2.2, 0, '#0d0d0f');   // scope tube
    seg(L, -23, -25, 2.8, 2.5, 0, c.light);    // scope bell
    seg(L, -10 + bolt, -12 + bolt, 1, 1, 4.6, c.light); // bolt handle
    seg(L, 2, -18, 0.6, 0.5, 3.4, c.glow);
  },
};

// gun metal per level
const METAL = { hell: ['#221a1c', '#35292b', '#4a3a3a'], robot: ['#262b33', '#3c434e', '#58616e'], witch: ['#1d2019', '#2e3328', '#454c3c'] };

function drawViewmodel(now) {
  const { W, H } = view, u = Math.min(W, H * 1.6) / 100;
  const moving = S.onGround ? Math.min(S.speed, 4) : 0;
  const bx = Math.sin(S.bobPhase) * moving * 0.4 * u, by = Math.abs(Math.cos(S.bobPhase)) * moving * 0.3 * u;
  const showBlade = S.weapon === 'blade' || now < S.quickUntil, w = showBlade ? 'blade' : S.weapon;
  const ax = W / 2 + 26 * u + bx, ay = H + 3 * u + by;       // anchor, bottom right
  const tx = W / 2 + 4 * u, ty = H / 2 + 10 * u;             // aim point, just below-right of the crosshair
  const ang = Math.atan2(tx - ax, ay - ty);                  // rotation that points local -y at the aim point
  const L = GUN_LEN[w], kick = S.recoil * (w === 'sniper' || w === 'shotgun' ? 6 : 3);
  const m = METAL[S.theme.id];
  const colors = { dark: m[0], mid: m[1], light: m[2], glow: 'rgba(' + S.theme.accent + ',' + (0.65 + 0.35 * Math.sin(now / 250)) + ')' };
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang + S.recoil * 0.12);
  ctx.scale(u, u);
  ctx.translate(0, kick);
  MODELS[w](L, now, colors);
  ctx.restore();
  if (S.muzzle > 0 && !showBlade) {
    const tip = (L - kick) * u;
    glow(ax + Math.sin(ang) * tip, ay - Math.cos(ang) * tip, (w === 'sniper' || w === 'shotgun' ? 11 : 5) * u * S.muzzle / 6, 'rgba(255,210,110,0.95)');
  }
}

export function drawWeaponView(now) {
  if (S.scoped && S.fov < BASE_FOV * 0.6) drawScope();
  else { drawCrosshair(); drawViewmodel(now); }
  if (S.muzzle > 0) S.muzzle--;
}

export function drawHitMarker() {
  if (S.hitMarker <= 0) return;
  const cx = view.W / 2, cy = view.H / 2, big = S.hitHead ? 1.6 : 1, a = S.hitMarker / 14;
  ctx.strokeStyle = S.hitHead ? 'rgba(255,60,30,' + a + ')' : 'rgba(255,255,255,' + a + ')';
  ctx.lineWidth = S.hitHead ? 3 : 2; ctx.beginPath();
  const o = 12 * big, i = 5 * big;
  ctx.moveTo(cx - o, cy - o); ctx.lineTo(cx - i, cy - i); ctx.moveTo(cx + o, cy - o); ctx.lineTo(cx + i, cy - i);
  ctx.moveTo(cx - o, cy + o); ctx.lineTo(cx - i, cy + i); ctx.moveTo(cx + o, cy + o); ctx.lineTo(cx + i, cy + i); ctx.stroke();
  S.hitMarker--;
}

// full-screen color flashes (kill, damage, heal) and the pit vignette
export function drawFlashes() {
  const { W, H } = view;
  const flash = (key, frames, rgb, max) => {
    if (S[key] <= 0) return;
    ctx.fillStyle = 'rgba(' + rgb + ',' + (S[key] / frames * max) + ')'; ctx.fillRect(0, 0, W, H);
    S[key]--;
  };
  flash('killFlash', 10, '255,230,200', 0.25);
  flash('hitFlash', 8, '255,0,0', 0.35);
  flash('healFlash', 10, '80,255,120', 0.2);
  if (inPit()) {
    const o = S.theme.pitOverlay, v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(' + o + ',0.05)'); v.addColorStop(1, 'rgba(' + o + ',0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
}

// kill / pickup banner: pops in, holds, fades
export function drawBanner(now) {
  const age = now - S.bannerT;
  if (age >= 1600) return;
  const a = age < 1200 ? 1 : 1 - (age - 1200) / 400, sc = 1 + Math.max(0, 1 - age / 150) * 0.5;
  ctx.save(); ctx.translate(view.W / 2, view.H * 0.3); ctx.scale(sc, sc);
  ctx.font = 'bold 40px Courier New'; ctx.textAlign = 'center';
  ctx.shadowColor = 'rgb(' + S.theme.accent + ')'; ctx.shadowBlur = 20;
  ctx.fillStyle = S.bannerGold ? 'rgba(255,200,60,' + a + ')' : 'rgba(255,90,60,' + a + ')';
  ctx.fillText(S.bannerText, 0, 0);
  ctx.restore();
}

export function drawSpeed() {
  ctx.font = 'bold 16px Courier New'; ctx.textAlign = 'center';
  ctx.fillStyle = S.speed > MAX_SPEED + 0.1 ? '#6f6' : '#aaa';
  ctx.fillText(Math.round(S.speed * 320 / MAX_SPEED) + ' u/s', view.W / 2, view.H - 40);
  ctx.textAlign = 'left';
}

// rotating minimap (forward is up) with the weapon list under it
export function drawMinimap(now) {
  const { W, H } = view, me = S.me;
  const size = Math.min(230, Math.round(Math.min(W, H) * 0.3)), mx = W - size - 12, my = 12, cx = mx + size / 2, cy = my + size / 2, ms = size / 14;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx, my, size, size);
  ctx.beginPath(); ctx.rect(mx, my, size, size); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-me.a - Math.PI / 2);
  ctx.scale(ms, ms);
  ctx.translate(-me.x, -me.y);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(mini, 0, 0, MW, MH);
  ctx.globalAlpha = 1;
  S.pickupSpots.forEach((p, i) => {
    if (!S.pickupActive[i]) return;
    ctx.fillStyle = 'rgb(' + GUN_COLOR[p.weapon].join(',') + ')'; ctx.fillRect(p.x - 0.25, p.y - 0.25, 0.5, 0.5);
  });
  for (const [id, o] of Object.entries(S.others)) {
    if (!o.now) continue;
    ctx.fillStyle = isEnemy(+id) ? '#f33' : '#4af';
    ctx.beginPath(); ctx.arc(o.now.x, o.now.y, 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#fa4'; // you: arrow pointing up
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5, cy + 6); ctx.lineTo(cx - 5, cy + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(' + S.theme.accent + ',0.6)'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, size, size);

  ctx.font = 'bold 15px Courier New'; ctx.textAlign = 'right';
  WEAPON_ORDER.forEach((w, i) => {
    const has = owned(w), ammo = AMMO[w] !== undefined && has ? ' ' + S.inv[w] : '';
    ctx.fillStyle = w === S.weapon ? '#fc6' : has ? '#aaa' : '#444';
    ctx.fillText((w === S.weapon ? '> ' : '') + (i + 1) + ' ' + w.toUpperCase() + ammo, mx + size, my + size + 22 + i * 22);
  });
  ctx.font = '12px Courier New'; ctx.fillStyle = '#777';
  ctx.fillText('F quick melee', mx + size, my + size + 22 + WEAPON_ORDER.length * 22);
  const cd = WEAPONS[S.weapon].cd, left = S.nextFire[S.weapon] - now; // reload bar for slow guns
  if (cd > 400 && left > 0) { ctx.fillStyle = 'rgb(' + S.theme.accent + ')'; ctx.fillRect(mx, my + size + 6, size * (1 - left / cd), 3); }
  ctx.textAlign = 'left';
}
