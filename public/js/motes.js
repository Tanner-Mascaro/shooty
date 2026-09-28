// Drifting motes on the home screen and lobby: fireflies, embers and violet sparks behind the
// parchment, and now and then a few that float across in front of it. Off during a match.
const COLORS = [[150, 230, 110], [255, 90, 70], [255, 150, 60], [190, 130, 255]]; // firefly, ember, ember, spark
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let back = [], front = [], canvases = null, raf = 0, last = 0, nextGust = 0;

function mote(W, H, rising) {
  const color = COLORS[Math.random() * COLORS.length | 0], ember = color[0] > 240;
  return {
    x: Math.random() * W, y: rising ? H + 10 : Math.random() * H,
    vx: (Math.random() - 0.5) * 14, vy: ember ? -(10 + Math.random() * 22) : (Math.random() - 0.5) * 10,
    r: 1 + Math.random() * 2.2, color, phase: Math.random() * 6.3, life: 0,
    ttl: 8 + Math.random() * 10,
  };
}

function step(list, g, W, H, dt, t) {
  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (const m of list) {
    m.life += dt;
    m.vx += Math.sin(t * 0.7 + m.phase) * 6 * dt; // lazy wander
    m.x += m.vx * dt; m.y += m.vy * dt;
    const fade = Math.min(1, m.life / 1.5, (m.ttl - m.life) / 1.5);
    const a = Math.max(0, fade) * (0.55 + 0.45 * Math.sin(t * 3 + m.phase)); // flicker
    const [r, gr, b] = m.color, glow = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 5);
    glow.addColorStop(0, `rgba(${r},${gr},${b},${0.9 * a})`);
    glow.addColorStop(0.3, `rgba(${r},${gr},${b},${0.35 * a})`);
    glow.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    g.fillStyle = glow; g.beginPath(); g.arc(m.x, m.y, m.r * 5, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return list.filter(m => m.life < m.ttl && m.x > -40 && m.x < W + 40 && m.y > -40 && m.y < H + 40);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const t = now / 1000, dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  const onHome = document.body.classList.contains('on-home');
  if (document.body.classList.contains('ingame')) { stop(); return; }
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  const behind = onHome ? canvases.home : canvases.wait;
  for (const c of [behind, canvases.front]) {
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  (onHome ? canvases.wait : canvases.home).getContext('2d').clearRect(0, 0, 1e5, 1e5);
  while (back.length < 42) back.push(mote(W, H, back.length > 30 && Math.random() < 0.5));
  // now and then a small drift floats across in front of the parchment
  if (t > nextGust) {
    nextGust = t + 7 + Math.random() * 10;
    const fromLeft = Math.random() < 0.5, y = H * (0.25 + Math.random() * 0.6);
    for (let i = 0; i < 5 + (Math.random() * 5 | 0); i++) {
      const m = mote(W, H);
      Object.assign(m, { x: fromLeft ? -20 - i * 30 : W + 20 + i * 30, y: y + (Math.random() - 0.5) * 120,
        vx: (fromLeft ? 1 : -1) * (60 + Math.random() * 50), vy: (Math.random() - 0.5) * 12, ttl: 30, r: 1.5 + Math.random() * 2 });
      front.push(m);
    }
  }
  back = step(back, behind.getContext('2d'), W, H, dt, t);
  front = step(front, canvases.front.getContext('2d'), W, H, dt, t);
}

function stop() {
  cancelAnimationFrame(raf); raf = 0; last = 0;
  for (const c of Object.values(canvases)) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

// called whenever the home screen or lobby shows; cheap to call again
export function startMotes() {
  if (reduced.matches) return;
  if (!canvases) {
    const make = (parent, cls) => { const c = document.createElement('canvas'); c.className = cls; c.setAttribute('aria-hidden', 'true'); parent.append(c); return c; };
    canvases = {
      home: make(document.querySelector('#home > .smoke'), 'motes'),
      wait: make(document.querySelector('#wait > .smoke'), 'motes'),
      front: make(document.body, 'motes front'),
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else startMotes(); });
  }
  if (!raf && !document.body.classList.contains('ingame')) raf = requestAnimationFrame(frame);
}
