// Everything drawn at full resolution on top of the 3D view: tracers, glows, the gun,
// crosshair / scope, hit markers, screen flashes, banner, minimap and weapon list.
import { MW, MH } from '/shared/levels.js';
import { WEAPONS, GUN_SLOTS, EYE, BODY_H } from '/shared/config.js';
import { S, spare, isEnemy, nameOf } from '../state.js';
import { BASE_FOV, SCOPE_FOV, MAX_SPEED, GUN_COLOR } from '../constants.js';
import { ctx, view } from './canvas.js';
import { project, occluded } from './world.js';
import { mini } from '../level.js';
import { inPit } from '../physics.js';
import { settings, keyName } from '../settings.js';
import { slotWeapon, gunToDrop } from '../weapons.js';
import { drawViewmodel, aimAmount } from './viewmodel.js';

const key = a => keyName(settings.keys[a]);

export function glow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function drawTracers(now) {
  S.tracers = S.tracers.filter(t => now - t.t < (t.weapon === 'sniper' ? 1500 : t.weapon === 'beam' ? 520 : 90));
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
    } else if (t.weapon === 'beam') {
      const k = 1 - age / 520, hot = Math.max(0, 1 - age / 120);
      line(A, B, 'rgba(160,40,140,' + (k * 0.4) + ')', 5 + age / 80);
      if (hot > 0) {
        line(A, B, 'rgba(255,60,220,' + (hot * 0.85) + ')', 6);
        line(A, B, 'rgba(255,220,250,' + hot + ')', 2);
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
    const r = p.weapon === 'ammo' ? 0.5 : 1; // crates get a small glow, only while there
    if (on || r === 1) glow(q.x, q.y, (on ? 260 : 120) * r / q.f, 'rgba(' + GUN_COLOR[p.weapon].join(',') + ',' + (on ? 0.45 : 0.15) + ')');
  });
  for (const b of S.boxes) { // loot boxes glow in the level's color
    const q = project(b.x, b.y, b.z + 0.05);
    if (q.f < 0.3 || occluded(q)) continue;
    glow(q.x, q.y, 170 / q.f, 'rgba(' + S.theme.accent + ',0.35)');
  }
  for (const n of S.thrown || []) {
    const q = project(n.x, n.y, n.z);
    if (q.f < 0.3 || occluded(q)) continue;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 90 + n.id);
    glow(q.x, q.y, (220 * pulse) / q.f, 'rgba(255,210,60,' + (0.35 + 0.35 * pulse) + ')');
  }
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

// sniper scope: a round lens with fine crosshairs, tapered posts, mil-dot ranging marks and a
// lit red center, a dark edge vignette and a faint glare. Opens up as it zooms in.
function drawScope(now) {
  const { W, H } = view, cx = W / 2, cy = H / 2;
  const open = Math.min(1, Math.max(0, (BASE_FOV * 0.6 - S.fov) / (BASE_FOV * 0.6 - SCOPE_FOV) * 1.4));
  const r = Math.min(W, H) * (0.36 + 0.1 * open);
  const acc = S.theme.accent;

  // everything outside the lens is the scope body
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill('evenodd');
  // lens: darker toward the rim, tinted by the level
  const lens = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  lens.addColorStop(0, 'rgba(0,0,0,0)'); lens.addColorStop(0.8, 'rgba(' + acc + ',0.06)'); lens.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // glare across the top left of the glass
  const glare = ctx.createLinearGradient(cx - r, cy - r, cx, cy);
  glare.addColorStop(0, 'rgba(255,255,255,0.07)'); glare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare; ctx.beginPath(); ctx.arc(cx, cy, r * 0.96, Math.PI * 0.95, Math.PI * 1.55); ctx.arc(cx - r * 0.1, cy - r * 0.1, r * 0.8, Math.PI * 1.55, Math.PI * 0.95, true); ctx.fill();
  // metal rim
  ctx.strokeStyle = 'rgba(' + acc + ',0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();

  // fine crosshair lines, then heavy posts that taper toward the middle
  const gap = r * 0.05;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx - gap, cy); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - gap); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  const post = (ax, ay, bx, by, w0, w1) => { // quad from (ax, ay) w0 wide to (bx, by) w1 wide
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
    ctx.beginPath(); ctx.moveTo(ax + nx * w0, ay + ny * w0); ctx.lineTo(bx + nx * w1, by + ny * w1);
    ctx.lineTo(bx - nx * w1, by - ny * w1); ctx.lineTo(ax - nx * w0, ay - ny * w0); ctx.closePath(); ctx.fill();
  };
  const inner = r * 0.42;
  post(cx - r, cy, cx - inner, cy, 4, 1.2); post(cx + r, cy, cx + inner, cy, 4, 1.2); post(cx, cy + r, cx, cy + inner, 4, 1.2);
  post(cx, cy - r, cx, cy - r * 0.62, 3, 1); // thinner top post leaves the view above clear

  // mil-dots: small ovals, a longer tick every other one below center for holdover
  for (let i = 1; i <= 4; i++) {
    const d = r * 0.085 * i;
    for (const [x, y] of [[cx - d, cy], [cx + d, cy], [cx, cy - d], [cx, cy + d]]) {
      ctx.beginPath(); ctx.ellipse(x, y, x === cx ? 2.2 : 1.4, x === cx ? 1.4 : 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (i % 2 === 0) ctx.fillRect(cx - 7, cy + d - 0.6, 14, 1.2);
  }

  // lit center: small red dot with a soft glow, pulsing faintly
  glow(cx, cy, 10, 'rgba(255,40,30,' + (0.35 + 0.1 * Math.sin(now / 300)) + ')');
  ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();

  // bolt still cycling after a shot: a thin arc around the edge fills up
  const left = S.nextFire.sniper - now, cd = WEAPONS.sniper.cd;
  if (left > 0) {
    ctx.strokeStyle = 'rgba(' + acc + ',0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left / cd)); ctx.stroke();
  }
}

// crosshair per weapon; the rifle/SMG gap opens in the air and on recoil
function drawCrosshair() {
  const cx = view.W / 2, cy = view.H / 2, w = S.weapon, sc = settings.crosshair;
  if (w === 'blade' || w === 'claws') {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 6 * sc, 0, Math.PI * 2); ctx.stroke();
  } else if (w === 'shotgun') {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, (22 + S.recoil * 10) * sc, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
  } else if (w === 'sniper') { // no crosshair unscoped, like CS
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
  } else {
    const g = (4 + (S.onGround ? 0 : 8) + S.recoil * 10) * sc, l = 8 * sc;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(cx - g - l, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + l, cy);
    ctx.moveTo(cx, cy - g - l); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + l); ctx.stroke();
  }
}

export function drawWeaponView(now) {
  if (S.clawsOnly) {
    drawViewmodel(now);
    if (aimAmount() < 0.5) drawCrosshair();
  } else if (S.scoped && S.weapon === 'sniper' && S.fov < BASE_FOV * 0.6) drawScope(now);
  else { drawViewmodel(now); if (aimAmount() < 0.5) drawCrosshair(); } // aimed: the iron sights are the crosshair
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

export function drawDamageIndicators(now) {
  const life = 900, { W, H } = view;
  S.damageIndicators = S.damageIndicators.filter(hit => now - hit.t < life);
  for (const hit of S.damageIndicators) {
    const alpha = 1 - (now - hit.t) / life;
    const dx = Math.cos(hit.angle), dy = Math.sin(hit.angle);
    const right = dx * S.cam.rtx + dy * S.cam.rty;
    const forward = dx * S.cam.fwdx + dy * S.cam.fwdy;
    const screenAngle = Math.atan2(-forward, right);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(screenAngle + Math.PI / 2);
    ctx.globalAlpha = alpha * 0.85;
    const radius = Math.min(120, Math.max(72, Math.min(W, H) * 0.12));
    const haze = ctx.createRadialGradient(0, 0, radius - 80, 0, 0, radius + 80);
    haze.addColorStop(0, 'rgba(255,35,30,0)');
    haze.addColorStop(0.28, 'rgba(255,35,30,0.01)');
    haze.addColorStop(0.42, 'rgba(255,35,30,0.18)');
    haze.addColorStop(0.5, 'rgba(255,35,30,0.3)');
    haze.addColorStop(0.58, 'rgba(255,35,30,0.18)');
    haze.addColorStop(0.72, 'rgba(255,35,30,0.03)');
    haze.addColorStop(1, 'rgba(255,35,30,0)');
    ctx.strokeStyle = haze; ctx.lineWidth = 64; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,25,20,0.4)'; ctx.shadowBlur = 38;
    ctx.beginPath(); ctx.arc(0, 0, radius, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke();
    ctx.restore();
  }
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
  const size = Math.min(230, Math.round(Math.min(W, H) * 0.3)), mx = W - size - 12, my = 12, cx = mx + size / 2, cy = my + size / 2, ms = size / 20;
  if (settings.showMinimap) {
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
    ctx.fillStyle = 'rgb(' + S.theme.accent + ')';
    for (const b of S.boxes) ctx.fillRect(b.x - 0.2, b.y - 0.2, 0.4, 0.4);
    for (const n of S.thrown) {
      ctx.fillStyle = '#2a2'; ctx.beginPath(); ctx.arc(n.x, n.y, 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8f8'; ctx.beginPath(); ctx.arc(n.x, n.y, 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(n.x + 0.12, n.y - 0.14, 0.1, 0, Math.PI * 2); ctx.fill();
    }
    for (const [id, o] of Object.entries(S.others)) {
      if (!o.now) continue;
      ctx.fillStyle = isEnemy(+id) ? '#f33' : '#4af';
      ctx.beginPath(); ctx.arc(o.now.x, o.now.y, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#fa4'; // you: arrow pointing up
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5, cy + 6); ctx.lineTo(cx - 5, cy + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(' + S.theme.accent + ',0.85)'; ctx.lineWidth = 3; ctx.strokeRect(mx, my, size, size);
    ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [label, angle] of [['N', -Math.PI / 2], ['E', 0], ['S', Math.PI / 2], ['W', Math.PI]]) {
      const screenAngle = angle - me.a - Math.PI / 2;
      const dx = Math.cos(screenAngle), dy = Math.sin(screenAngle), edge = size / 2 - 8;
      const scale = edge / Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx * scale, y = cy + dy * scale;
      const highlighted = label === 'N';
      ctx.fillStyle = highlighted ? 'rgb(' + S.theme.accent + ')' : 'rgba(0,0,0,0.92)'; ctx.fillRect(x - 9, y - 9, 18, 18);
      ctx.strokeStyle = highlighted ? '#fff' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.strokeRect(x - 9, y - 9, 18, 18);
      ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 0.5);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  ctx.font = 'bold 15px Courier New'; ctx.textAlign = 'right';
  const listY = settings.showMinimap ? my + size : my;
  if (S.clawsOnly) {
    ctx.fillStyle = '#a9e66c';
    ctx.fillText('CLAWS', mx + size, listY + 22);
    ctx.font = '12px Courier New'; ctx.fillStyle = '#ddd';
    ctx.fillText('Hold left click: attack', mx + size, listY + 44);
    ctx.fillText(key('jump') + ' twice: double jump', mx + size, listY + 62);
    const cooldown = Math.max(0, S.nextDash - now);
    ctx.fillStyle = cooldown ? '#aaa' : '#a9e66c';
    ctx.fillText(key('slide') + ' dash: ' + (cooldown ? (cooldown / 1000).toFixed(1) + 's' : 'READY'), mx + size, listY + 80);
    ctx.textAlign = 'left';
    return;
  }
  const slots = GUN_SLOTS + 1; // two guns, then the blade
  for (let i = 1; i <= slots; i++) {
    const w = slotWeapon(i), ammo = w && w !== 'blade' ? ' ' + S.mag[w] + '/' + spare(w) : '';
    ctx.fillStyle = w && w === S.weapon ? '#fc6' : w ? '#aaa' : '#444';
    ctx.fillText((w && w === S.weapon ? '> ' : '') + key('slot' + i) + ' ' + (w ? w.toUpperCase() : 'EMPTY') + ammo, mx + size, listY + 22 * i);
  }
  ctx.font = '12px Courier New'; ctx.fillStyle = '#777';
  ctx.fillText(key('melee') + ' melee · ' + key('reload') + ' reload · ' + key('swap') + ' switch · ' + key('nade') + ' nade', mx + size, listY + 22 * (slots + 1));
  if (S.nades > 0) {
    ctx.font = 'bold 14px Courier New'; ctx.fillStyle = '#6c6';
    ctx.fillText('GRENADES ' + S.nades, mx + size, listY + 22 * (slots + 2));
  }
  const cd = WEAPONS[S.weapon].cd, left = S.nextFire[S.weapon] - now; // chamber bar for slow guns
  if (settings.showMinimap && cd > 400 && left > 0 && !S.reloading) { ctx.fillStyle = 'rgb(' + S.theme.accent + ')'; ctx.fillRect(mx, my + size + 6, size * (1 - left / cd), 3); }
  ctx.textAlign = 'left';
}

// big ammo count, bottom right, and the reload bar under the crosshair
export function drawAmmo(now) {
  const { W, H } = view, w = S.weapon;
  if (w === 'blade' || w === 'claws') return;
  const mag = S.mag[w] ?? 0, full = WEAPONS[w].mag, left = spare(w), tail = ' / ' + left;
  ctx.textAlign = 'right'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  ctx.font = 'bold 20px Courier New'; ctx.fillStyle = '#aaa';
  ctx.fillText(tail, W - 20, H - 24);
  const tw = ctx.measureText(tail).width;
  ctx.font = 'bold 40px Courier New'; ctx.fillStyle = mag === 0 ? '#f55' : mag <= full / 4 ? '#fc6' : '#fff';
  ctx.fillText(mag, W - 20 - tw, H - 24);
  ctx.font = 'bold 13px Courier New'; ctx.fillStyle = '#999';
  ctx.fillText(w.toUpperCase(), W - 20, H - 70);
  ctx.shadowBlur = 0; ctx.textAlign = 'center';
  const r = S.reloading, y = H / 2 + 44;
  if (r) {
    const k = Math.min(1, (now - r.start) / (r.until - r.start)), bw = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - bw / 2, y, bw, 5);
    ctx.fillStyle = 'rgb(' + S.theme.accent + ')'; ctx.fillRect(W / 2 - bw / 2, y, bw * k, 5);
    ctx.font = 'bold 12px Courier New'; ctx.fillStyle = '#ddd'; ctx.fillText('RELOADING', W / 2, y - 6);
  } else if (mag <= full / 4 && left > 0) {
    ctx.font = 'bold 13px Courier New'; ctx.fillStyle = '#fc6'; ctx.fillText(key('reload') + ' RELOAD', W / 2, y);
  } else if (mag <= full / 4) {
    ctx.font = 'bold 13px Courier New'; ctx.fillStyle = '#f55'; ctx.fillText(mag ? 'LOW AMMO' : 'NO AMMO — find an ammo crate', W / 2, y);
  }
  ctx.textAlign = 'left';
}

// "E  Take SNIPER" when you're in reach of a gun pad or a loot box
export function drawUsePrompt() {
  const t = S.useTarget;
  if (!t || !t.items.length) return;
  const { W, H } = view, drop = gunToDrop(), items = t.items.map(w => w.toUpperCase());
  let text;
  if (t.pad !== undefined) text = S.mag[t.items[0]] !== undefined ? 'Take ' + items[0] + ' ammo' : drop ? 'Swap ' + drop.toUpperCase() + ' for ' + items[0] : 'Take ' + items[0];
  else text = 'Loot box: ' + items.join(', ');
  const k = key('use');
  ctx.font = 'bold 16px Courier New';
  const kw = ctx.measureText(k).width + 14, tw = ctx.measureText(text).width, x = W / 2 - (kw + 10 + tw) / 2, y = H / 2 + 80;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 8, y - 18, kw + 10 + tw + 16, 28);
  ctx.strokeStyle = '#fc6'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y - 14, kw, 20);
  ctx.fillStyle = '#fc6'; ctx.textAlign = 'center'; ctx.fillText(k, x + kw / 2, y + 1);
  ctx.fillStyle = '#eee'; ctx.textAlign = 'left'; ctx.fillText(text, x + kw + 10, y + 1);
}
