// Heightmap built from a level map. Used for rendering, movement, bullets and pickups
// on both the server and the browser, so they always agree.
//
// Each map square becomes RES x RES samples. Obstacles are smooth shapes, styled per level:
//   hell   # clusters -> volcano cones with a lava crater, + -> boulders, edge -> jagged cliffs
//   ice    # clusters -> icebergs (no lava), + -> ice chunks, edge -> frozen cliffs
//   witch  # -> trees (trunk here; the canopy is a sprite drawn by the client), + -> bushes,
//          edge -> a thick hedge with trees
//   robot  # -> server racks (touching # join into one row), + -> crates, edge -> metal wall
//   haunt / castle  # -> full-height walls (touching # join into rooms), + -> furniture / rubble,
//          edge -> wall, under a ceiling (the client draws it at CEILING_H)
//
// kind: 0 = ground (walkable, may slope), 1 = blocked (anything taller than STEP_H), 2 = pit
// mat:  what a sample is made of, for the client's colors (MAT below)
// props: things the client draws or animates on top: trees (canopies), volcano craters

export const MAT = { FLOOR: 0, PIT: 1, WALL: 2, ROCK: 3, LAVA: 4, BARK: 5, ROOTS: 6, LEAVES: 7, RACK: 8, CRATE: 9 };
export const CEILING_H = 2.8; // haunted house: walls go all the way up to the ceiling
const STEP_H = 0.3; // taller than this can't be walked onto (matches the client's step height)

// smooth value noise in 0..1, same everywhere (seeded by position only)
const hash2 = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
export const noise = (x, y) => (vnoise(x, y) * 2 + vnoise(x * 2.1 + 17, y * 2.1 + 9)) / 3;

export function buildTerrain(MAP, RES, style) {
  const MW = MAP[0].length, MH = MAP.length, TW = MW * RES, TH = MH * RES;
  const hgt = new Float32Array(TW * TH), kind = new Uint8Array(TW * TH), mat = new Uint8Array(TW * TH);
  const props = [];
  const at = (cx, cy) => cx < 0 || cy < 0 || cx >= MW || cy >= MH ? '#' : MAP[cy][cx];
  const edge = (cx, cy) => cx === 0 || cy === 0 || cx === MW - 1 || cy === MH - 1;

  // raise samples in a box to shape(x, y) -> [height, mat] (or null); the tallest shape wins
  function raise(x0, y0, x1, y1, shape) {
    const i0 = Math.max(0, Math.floor(x0 * RES)), i1 = Math.min(TW - 1, Math.ceil(x1 * RES));
    const j0 = Math.max(0, Math.floor(y0 * RES)), j1 = Math.min(TH - 1, Math.ceil(y1 * RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * TW + i;
      if (mat[k] === MAT.PIT) continue;
      const r = shape((i + 0.5) / RES, (j + 0.5) / RES);
      if (r && r[0] > hgt[k]) { hgt[k] = r[0]; mat[k] = r[1]; }
    }
  }
  // low cover: a dome cut off where it's lower than a step, so it has no rim you'd pop up onto
  const dome = (cx, cy, rad, h, m, bump) => raise(cx - rad, cy - rad, cx + rad, cy + rad, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / rad, z = d < 1 ? h * Math.sqrt(1 - d * d) * (1 - bump + bump * 2 * noise(x * 4, y * 4)) : 0;
    return z > STEP_H ? [z, m] : null;
  });
  const box = (x0, y0, x1, y1, h, m) => raise(x0, y0, x1, y1, (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1 ? [h, m] : null);

  // pits
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) if (at(cx, cy) === 'L')
    for (let j = cy * RES; j < (cy + 1) * RES; j++) for (let i = cx * RES; i < (cx + 1) * RES; i++) { hgt[j * TW + i] = -0.35; mat[j * TW + i] = MAT.PIT; }

  // boundary: how far a point is inside the playable area (negative = in the wall)
  const inside = (x, y) => Math.min(x - 1, y - 1, MW - 1 - x, MH - 1 - y);
  raise(0, 0, MW, MH, (x, y) => {
    const e = inside(x, y);
    if (style === 'hell' || style === 'ice') return e < noise(x * 1.3, y * 1.3) * 0.5 - 0.1 ? [2.2 + noise(x * 0.7 + 5, y * 0.7) + Math.min(1, -e) * 0.6, MAT.ROCK] : null;
    if (style === 'witch') return e < noise(x * 1.1, y * 1.1) * 0.3 - 0.05 ? [1.7 + 0.7 * noise(x * 1.5, y * 1.5), MAT.LEAVES] : null;
    return e < 0 ? [2.8, MAT.WALL] : null;
  });
  if (style === 'witch') // trees poking out of the hedge
    for (let t = 1.5; t < MW - 1; t += 2.3) for (const [x, y] of [[t, 0.55], [MW - t, MH - 0.55], [0.55, MH - t], [MW - 0.55, t]])
      props.push({ type: 'tree', x, y, h: 2.2, r: 0.9 + 0.3 * hash2(x * 7 | 0, y * 7 | 0) });

  // interior obstacles
  const seen = new Set();
  for (let cy = 1; cy < MH - 1; cy++) for (let cx = 1; cx < MW - 1; cx++) {
    const c = at(cx, cy), x = cx + 0.5, y = cy + 0.5, n = hash2(cx, cy);
    if (c === '+') {
      if (style === 'robot' || style === 'haunt' || style === 'castle') box(cx + 0.2, cy + 0.2, cx + 0.8, cy + 0.8, 0.55, MAT.CRATE);
      else if (style === 'witch') dome(x, y, 0.6, 0.65, MAT.LEAVES, 0.25);
      else dome(x + (n - 0.5) * 0.2, y, 0.5, 0.55, MAT.ROCK, 0.3);
    }
    if (c !== '#' || edge(cx, cy)) continue;
    if (style === 'haunt' || style === 'castle') { box(cx, cy, cx + 1, cy + 1, CEILING_H, MAT.WALL); continue; } // whole squares, so walls join flush
    if (style === 'robot') {
      // rack: inset from the square's sides unless the next square is rack too, so rows join up
      const m = 0.12;
      box(cx + (at(cx - 1, cy) === '#' ? 0 : m), cy + (at(cx, cy - 1) === '#' ? 0 : m),
          cx + 1 - (at(cx + 1, cy) === '#' ? 0 : m), cy + 1 - (at(cx, cy + 1) === '#' ? 0 : m), 1.9, MAT.RACK);
    } else if (style === 'witch') {
      const tx = x + (n - 0.5) * 0.3, ty = y + (hash2(cy, cx) - 0.5) * 0.3, tr = 0.26;
      raise(tx - 0.7, ty - 0.7, tx + 0.7, ty + 0.7, (px, py) => {
        const d = Math.hypot(px - tx, py - ty);
        if (d < tr) return [2.4, MAT.BARK];
        if (d < 0.65) return [0.08 * (1 - (d - tr) / (0.65 - tr)) ** 2 * (0.6 + 0.8 * noise(px * 6, py * 6)), MAT.ROOTS]; // root flare: low enough not to trip on
        return null;
      });
      props.push({ type: 'tree', x: tx, y: ty, h: 2.4, r: 0.95 + 0.35 * n });
    } else if (!seen.has(cx + ',' + cy)) {
      // volcano / iceberg: one cone per group of touching # squares
      const cells = [], stack = [[cx, cy]];
      seen.add(cx + ',' + cy);
      while (stack.length) {
        const [a, b] = stack.pop();
        cells.push([a, b]);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (a + da) + ',' + (b + db);
          if (!seen.has(k) && at(a + da, b + db) === '#' && !edge(a + da, b + db)) { seen.add(k); stack.push([a + da, b + db]); }
        }
      }
      const vx = cells.reduce((s, c) => s + c[0] + 0.5, 0) / cells.length, vy = cells.reduce((s, c) => s + c[1] + 0.5, 0) / cells.length;
      const R = Math.max(...cells.map(c => Math.hypot(c[0] + 0.5 - vx, c[1] + 0.5 - vy))) + 1.4;
      const H = Math.min(2.8, 1.5 + 0.3 * cells.length), rc = 0.2, rim = H * (1 - rc) ** 1.5;
      const icy = style === 'ice';
      raise(vx - R, vy - R, vx + R, vy + R, (px, py) => {
        const d = Math.hypot(px - vx, py - vy), t = d / R;
        if (t >= 1) return null;
        if (t < rc) return [rim - (1 - t / rc) * 0.3 * H, icy ? MAT.ROCK : (t < rc * 0.75 ? MAT.LAVA : MAT.ROCK)]; // crater
        if (icy) return [H * (1 - t) ** 1.5 * (0.9 + 0.2 * noise(px * 2.5, py * 2.5)), MAT.ROCK];
        const ang = Math.atan2(py - vy, px - vx), streak = Math.sin(ang * 5 + d * 1.7 + H) > 0.94 && t < 0.6; // glowing lava runs
        return [H * (1 - t) ** 1.5 * (0.9 + 0.2 * noise(px * 2.5, py * 2.5)), streak ? MAT.LAVA : MAT.ROCK];
      });
      props.push({ type: 'volcano', x: vx, y: vy, top: rim - 0.2 * H });
    }
  }

  for (let k = 0; k < TW * TH; k++) kind[k] = mat[k] === MAT.PIT ? 2 : hgt[k] > STEP_H ? 1 : 0;

  // scatter extra cover / ruins on open ground so maps feel denser without clogging lanes
  for (let cy = 2; cy < MH - 2; cy++) for (let cx = 2; cx < MW - 2; cx++) {
    if (at(cx, cy) !== '.') continue;
    const n = hash2(cx * 3 + 11, cy * 5 + 7);
    if (n > 0.965) { // sparse rubble piles
      const x = cx + 0.5, y = cy + 0.5;
      if (style === 'witch') dome(x, y, 0.55, 0.5, MAT.LEAVES, 0.2);
      else if (style === 'robot' || style === 'haunt' || style === 'castle') box(cx + 0.25, cy + 0.25, cx + 0.75, cy + 0.75, 0.45, MAT.CRATE);
      else dome(x, y, 0.45, 0.48, MAT.ROCK, 0.25);
    } else if (n > 0.992 && (style === 'witch')) { // extra lonely trees
      const x = cx + 0.5 + (hash2(cy, cx) - 0.5) * 0.2, y = cy + 0.5;
      raise(x - 0.5, y - 0.5, x + 0.5, y + 0.5, (px, py) => Math.hypot(px - x, py - y) < 0.22 ? [2.2, MAT.BARK] : null);
      props.push({ type: 'tree', x, y, h: 2.2, r: 0.85 + 0.3 * n });
    } else if (n > 0.988 && (style === 'haunt' || style === 'castle') && at(cx + 1, cy) === '#' && at(cx, cy + 1) === '#') {
      // corner buttress against walls
      box(cx + 0.15, cy + 0.15, cx + 0.85, cy + 0.85, CEILING_H * 0.85, MAT.WALL);
    }
  }

  for (let k = 0; k < TW * TH; k++) kind[k] = mat[k] === MAT.PIT ? 2 : hgt[k] > STEP_H ? 1 : 0;
  return { hgt, kind, mat, props, TW, TH, RES };
}

// bilinear height at a world position
export function groundAt(T, x, y) {
  const fx = x * T.RES - 0.5, fy = y * T.RES - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const g = (a, b) => {
    a = a < 0 ? 0 : a >= T.TW ? T.TW - 1 : a;
    b = b < 0 ? 0 : b >= T.TH ? T.TH - 1 : b;
    return T.hgt[b * T.TW + a];
  };
  return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
}

export function kindAt(T, x, y) {
  const i = Math.floor(x * T.RES), j = Math.floor(y * T.RES);
  if (i < 0 || j < 0 || i >= T.TW || j >= T.TH) return 1;
  return T.kind[j * T.TW + i];
}

// does a player of radius r standing at (x, y) overlap a wall (or the map edge)?
// Same test as wallHitbox in public/js/physics.js, so the server agrees with the client.
export function hitsWall(T, x, y, r) {
  const minI = Math.floor((x - r) * T.RES), maxI = Math.floor((x + r) * T.RES);
  const minJ = Math.floor((y - r) * T.RES), maxJ = Math.floor((y + r) * T.RES);
  for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
    if (i < 0 || j < 0 || i >= T.TW || j >= T.TH) return true;
    if (T.kind[j * T.TW + i] !== 1) continue;
    const cx = Math.min(Math.max(x, i / T.RES), (i + 1) / T.RES), cy = Math.min(Math.max(y, j / T.RES), (j + 1) / T.RES);
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  }
  return false;
}

// pickup pads in map order; the server and client index them identically
export function findPickups(MAP) {
  const kinds = { S: 'sniper', G: 'shotgun', M: 'smg', H: 'health', N: 'nade' }, out = [];
  for (let y = 0; y < MAP.length; y++)
    for (let x = 0; x < MAP[y].length; x++)
      if (kinds[MAP[y][x]]) out.push({ x: x + 0.5, y: y + 0.5, weapon: kinds[MAP[y][x]] });
  return out;
}
