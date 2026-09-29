// Heightmap built from a level map. Used for rendering, movement, bullets and pickups
// on both the server and the browser, so they always agree.
//
// Each map square becomes RES x RES samples. Obstacles are smooth shapes, styled per level:
//   hell   # clusters -> volcano cones with a lava crater, + -> boulders, B -> lava-ruin huts,
//          edge -> jagged cliffs
//   ice    # clusters -> icebergs (no lava), + -> ice chunks, B -> ice lodges, edge -> frozen cliffs
//   witch  # -> trees (collision here; the client draws the tree over it), + -> bushes,
//          B -> two-storey cottages, edge -> a thick hedge with trees
//   robot  # -> server racks (touching # join into one row), + -> crates, edge -> metal wall
//   haunt  # -> full-height walls under a ceiling (CEILING_H)
//   castle # -> stone walls of uneven height: curtain walls + taller corner/keep towers
//          T -> climbable multi-level towers with switchback stairs + battlement decks
//          edge -> wall, under a ceiling (the client draws it at CEILING_H)
//   nuke   # clusters -> cars / a bus, + -> junk crates, B clusters -> big enterable houses
//          facing the street, edge -> block wall
//   cove   # clusters -> sandstone rocks, + -> crates, B -> fishing huts, R / I -> a moored sloop's
//          rail and mast (as ship), edge -> sea cliffs
//   yard   # -> stone mausoleum walls, + -> gravestones, B -> a stone chapel, L -> open graves
//   ship   # -> deckhouse walls, + -> cargo crates, R -> a ship's rail, I -> a mast (with a sail
//          prop), edge -> open sea (the map's L all round)
//
// kind: 0 = ground (walkable, may slope), 1 = blocked (anything taller than STEP_H), 2 = pit
// mat:  what a sample is made of, for the client's colors (MAT below)
// props: things the client draws or animates on top: trees, volcano craters, cottages (huts)

export const MAT = { FLOOR: 0, PIT: 1, WALL: 2, ROCK: 3, LAVA: 4, BARK: 5, ROOTS: 6, LEAVES: 7, RACK: 8, CRATE: 9, PUMPKIN: 10, STONE: 11, DOOR: 12, RAIL: 13, ROPE: 14, GRAVE: 15 }; // RAIL / ROPE / GRAVE: ships' rails, rope rails, gravestones (drawn as props) // STONE: conjured ramps (shared/spells.js); DOOR: the Crypt's doors (shared/crypt.js)

// enterable cottages: walls, roof and roof pitch per map style (touching B squares make one)
const COTTAGES = {
  witch: { wall: MAT.BARK, roof: MAT.LEAVES, peak: 0.9 },
  nuke: { wall: MAT.BARK, roof: MAT.CRATE, peak: 1.15 },
  hell: { wall: MAT.ROCK, roof: MAT.ROCK, peak: 0.9 },
  ice: { wall: MAT.BARK, roof: MAT.ROCK, peak: 1.0 },
  cove: { wall: MAT.BARK, roof: MAT.CRATE, peak: 0.8 },
  yard: { wall: MAT.WALL, roof: MAT.ROCK, peak: 1.3 },
};
// Every cottage has two storeys. Players are 0.8 tall, jump ~0.43 and step up 0.3.
//   floor: the upper floor you stand on; slab: its thickness (ground floor headroom = floor - slab)
//   top: wall height; door: doorway height; sill / lintel: window bottom / top above each floor
//   stairs: `steps` treads of `rise` x `tread` along the back wall, climbing from the room toward the -x wall,
//   then one more rise onto the floor. Collision follows a smooth ramp over the full run.
export const HOUSE = { floor: 1.4, slab: 0.3, top: 2.55, door: 1.0, sill: 0.35, lintel: 0.8, win: 0.3,
  rise: 0.28, tread: 0.36, steps: 4, stairW: 0.75, roofT: 0.15 };
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
    if (style === 'hell' || style === 'ice' || style === 'cove') return e < noise(x * 1.3, y * 1.3) * 0.5 - 0.1 ? [2.2 + noise(x * 0.7 + 5, y * 0.7) + Math.min(1, -e) * 0.6, MAT.ROCK] : null;
    if (style === 'witch') return e < noise(x * 1.1, y * 1.1) * 0.3 - 0.05 ? [1.7 + 0.7 * noise(x * 1.5, y * 1.5), MAT.LEAVES] : null;
    if (style === 'castle') return e < 0 ? [3.8 + Math.min(2, -e) * 0.9 + noise(x * 0.6, y * 0.6) * 1.6, MAT.WALL] : null;
    if (style === 'ship') return null; // open sea to the horizon
    return e < 0 ? [2.8, MAT.WALL] : null;
  });
  if (style === 'witch') // trees poking out of the hedge
    for (let t = 1.5; t < MW - 1; t += 2.3) for (const [x, y] of [[t, 0.55], [MW - t, MH - 0.55], [0.55, MH - t], [MW - 0.55, t]])
      props.push({ type: 'tree', x, y, h: 2.2, r: 0.9 + 0.3 * hash2(x * 7 | 0, y * 7 | 0) });

  // interior obstacles
  const seen = new Set();
  for (let cy = 1; cy < MH - 1; cy++) for (let cx = 1; cx < MW - 1; cx++) {
    const c = at(cx, cy), x = cx + 0.5, y = cy + 0.5, n = hash2(cx, cy);
    if (style === 'crypt' && c === '.' && n > 0.965) props.push({ type: 'bones', x: x + (hash2(cy, cx) - 0.5) * 0.5, y, n }); // bones about the floor (just for looks)
    if (c === '+') {
      if (style === 'nuke') { // pumpkin: a squat dome to hide behind, drawn as a real pumpkin mesh
        dome(x, y, 0.42, 0.5, MAT.PUMPKIN, 0);
        props.push({ type: 'pumpkin', x, y, r: 0.42 + 0.06 * n });
      } else if (style === 'crypt' || style === 'yard') { // a headstone: the client draws it (rounded top, a lean)
        box(cx + 0.18, cy + 0.36, cx + 0.82, cy + 0.64, 0.75, MAT.GRAVE);
        props.push({ type: 'grave', x, y, n });
      }
      else if (style === 'ship' || style === 'cove') box(cx + 0.12, cy + 0.12, cx + 0.88, cy + 0.88, 0.75, MAT.CRATE); // cargo
      else if (style === 'robot' || style === 'haunt' || style === 'castle') box(cx + 0.2, cy + 0.2, cx + 0.8, cy + 0.8, 0.55, MAT.CRATE);
      else if (style === 'witch') dome(x, y, 0.7, 0.5, MAT.LEAVES, 0.2);
      else dome(x + (n - 0.5) * 0.2, y, 0.5, 0.55, MAT.ROCK, 0.3);
    }
    // cottages: contiguous B cells become one enterable building (walls only so the inside is
    // walkable; the roof is raised afterward)
    if (c === 'B' && COTTAGES[style] && !seen.has('B' + cx + ',' + cy)) {
      const cells = [], stack = [[cx, cy]];
      seen.add('B' + cx + ',' + cy);
      while (stack.length) {
        const [a, b] = stack.pop();
        cells.push([a, b]);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = a + da, ny = b + db, k = 'B' + nx + ',' + ny;
          if (!seen.has(k) && at(nx, ny) === 'B') { seen.add(k); stack.push([nx, ny]); }
        }
      }
      const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
      const minY = Math.min(...cells.map(c => c[1])), maxY = Math.max(...cells.map(c => c[1]));
      const x0 = minX, y0 = minY, x1 = maxX + 1, y1 = maxY + 1;
      const W = x1 - x0, D = y1 - y0;
      const look = COTTAGES[style], wallH = HOUSE.top, t = style === 'witch' ? 0.16 : 0.18;
      const wallMat = look.wall;
      const midY = (minY + maxY) * 0.5;
      const doorDir = midY < MH / 2 ? 1 : -1; // door toward mid-map
      const doorHalf = Math.max(style === 'witch' ? 0.7 : 0.85, W * 0.22);
      const doorL = x0 + W / 2 - doorHalf, doorR = x0 + W / 2 + doorHalf;
      const clearFloor = (xa, ya, xb, yb) => {
        const i0 = Math.max(0, Math.floor(xa * RES)), i1 = Math.min(TW - 1, Math.ceil(xb * RES));
        const j0 = Math.max(0, Math.floor(ya * RES)), j1 = Math.min(TH - 1, Math.ceil(yb * RES));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * TW + i;
          if (mat[k] === MAT.PIT) continue;
          hgt[k] = 0; mat[k] = MAT.FLOOR;
        }
      };
      box(x0, y0, x0 + t, y1, wallH, wallMat);
      box(x1 - t, y0, x1, y1, wallH, wallMat);
      if (doorDir > 0) {
        box(x0 + t, y0, x1 - t, y0 + t, wallH, wallMat);
        box(x0 + t, y1 - t, doorL, y1, wallH, wallMat);
        box(doorR, y1 - t, x1 - t, y1, wallH, wallMat);
      } else {
        box(x0 + t, y1 - t, x1 - t, y1, wallH, wallMat);
        box(x0 + t, y0, doorL, y0 + t, wallH, wallMat);
        box(doorR, y0, x1 - t, y0 + t, wallH, wallMat);
      }
      clearFloor(x0 + t + 0.06, y0 + t + 0.06, x1 - t - 0.06, y1 - t - 0.06);
      if (doorDir > 0) {
        clearFloor(doorL, y1 - 0.05, doorR, y1 + 0.7);
        box(x0 + t, y1 - t, doorL, y1, wallH, wallMat);
        box(doorR, y1 - t, x1 - t, y1, wallH, wallMat);
      } else {
        clearFloor(doorL, y0 - 0.7, doorR, y0 + 0.05);
        box(x0 + t, y0, doorL, y0 + t, wallH, wallMat);
        box(doorR, y0, x1 - t, y0 + t, wallH, wallMat);
      }
      // stairs up the back wall (away from the door): the bottom step faces into the room, the top is at the -x wall
      const sx = x0 + t + 0.05, sy = doorDir > 0 ? y0 + t : y1 - t - HOUSE.stairW;
      const stairs = { x0: sx, x1: sx + HOUSE.steps * HOUSE.tread, y0: sy, y1: sy + HOUSE.stairW };
      props.push({ type: 'hut', x: x0 + W / 2, y: y0 + D / 2, h: wallH, w: W, d: D, t, peak: look.peak, style, doorDir, doorHalf, stairs });
      continue;
    }
    if ((style === 'ship' || style === 'cove') && c === 'R') { // rail: fills its square, so there's no ledge outside it;
      box(cx, cy, cx + 1, cy + 1, 0.5, MAT.RAIL);                  // low enough to shoot over, and hop (into the sea)
      props.push({ type: 'rail', x, y, cx, cy });
      continue;
    }
    if ((style === 'ship' || style === 'cove') && c === 'I') { // mast: a thick pole; the client hangs the yard and sail on it
      box(cx + 0.3, cy + 0.3, cx + 0.7, cy + 0.7, 5.5, MAT.BARK);
      props.push({ type: 'mast', x, y, h: 5.5 });
      continue;
    }
    // the fleet's gangplanks and holed decks: a rope rail along any edge that drops to open water,
    // too high to jump (the ropes are drawn lower; this is the posts' reach)
    if (style === 'ship' && c !== '#' && c !== 'L' && c !== 'I') {
      const t = 0.07;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (at(cx + dx, cy + dy) !== 'L') continue;
        const x0 = dx > 0 ? cx + 1 - t : cx, x1 = dx < 0 ? cx + t : cx + 1, y0 = dy > 0 ? cy + 1 - t : cy, y1 = dy < 0 ? cy + t : cy + 1;
        box(dx ? x0 : cx, dy ? y0 : cy, dx ? x1 : cx + 1, dy ? y1 : cy + 1, 0.8, MAT.ROPE);
        // the rope runs along the edge: from one end of it to the other
        props.push(dx ? { type: 'rope', x0: dx > 0 ? cx + 1 : cx, y0: cy, x1: dx > 0 ? cx + 1 : cx, y1: cy + 1 }
          : { type: 'rope', x0: cx, y0: dy > 0 ? cy + 1 : cy, x1: cx + 1, y1: dy > 0 ? cy + 1 : cy });
      }
    }
    if (c !== '#' || edge(cx, cy)) continue;
    if (style === 'ship' || style === 'yard') { box(cx, cy, cx + 1, cy + 1, style === 'yard' ? 2.4 : 2.2, MAT.WALL); continue; }
    if (style === 'haunt' || style === 'crypt') { box(cx, cy, cx + 1, cy + 1, CEILING_H, MAT.WALL); continue; }
    if (style === 'castle') {
      // uneven skyline: dense clumps and corners become towers; thin walls stay lower
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(cx + dx, cy + dy) === '#') near++;
      const N = at(cx, cy - 1) === '#', S = at(cx, cy + 1) === '#', E = at(cx + 1, cy) === '#', W = at(cx - 1, cy) === '#';
      const orth = (N ? 1 : 0) + (S ? 1 : 0) + (E ? 1 : 0) + (W ? 1 : 0);
      const corner = orth === 2 && ((N && E) || (N && W) || (S && E) || (S && W));
      const jitter = hash2(cx, cy);
      let h;
      if (near >= 7) h = 6.2 + jitter * 1.8;          // keep / tower mass
      else if (corner && near >= 4) h = 4.8 + jitter * 1.4; // corner towers
      else if (orth >= 3) h = 3.8 + jitter * 0.7;       // junctions / thick walls
      else h = 2.9 + jitter * 0.55;                     // curtain walls
      box(cx, cy, cx + 1, cy + 1, h, MAT.WALL);
      continue;
    }
    if (style === 'robot') {
      // rack: inset from the square's sides unless the next square is rack too, so rows join up
      const m = 0.12;
      box(cx + (at(cx - 1, cy) === '#' ? 0 : m), cy + (at(cx, cy - 1) === '#' ? 0 : m),
          cx + 1 - (at(cx + 1, cy) === '#' ? 0 : m), cy + 1 - (at(cx, cy + 1) === '#' ? 0 : m), 1.9, MAT.RACK);
    } else if (style === 'witch') {
      // thick trunk blocks shots; low leaf skirt blocks walking through the canopy without eating eye-height bullets
      const tx = x + (n - 0.5) * 0.3, ty = y + (hash2(cy, cx) - 0.5) * 0.3, tr = 0.4, canopy = 0.75;
      raise(tx - 0.9, ty - 0.9, tx + 0.9, ty + 0.9, (px, py) => {
        const d = Math.hypot(px - tx, py - ty);
        if (d < tr) return [2.4, MAT.BARK];
        if (d < canopy) return [0.48, MAT.LEAVES]; // > STEP_H so you can't walk through; < EYE so guns still work
        if (d < 0.9) return [0.08 * (1 - (d - canopy) / (0.9 - canopy)) ** 2 * (0.6 + 0.8 * noise(px * 6, py * 6)), MAT.ROOTS];
        return null;
      });
      props.push({ type: 'tree', x: tx, y: ty, h: 2.4, r: 0.95 + 0.35 * n });
    } else if (style === 'nuke' && !seen.has(cx + ',' + cy)) {
      // cars and a bus: one hull per group of touching # squares
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
      const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
      const minY = Math.min(...cells.map(c => c[1])), maxY = Math.max(...cells.map(c => c[1]));
      const bus = cells.length >= 6;
      const h = bus ? 1.35 : 0.95, inset = bus ? 0.08 : 0.18;
      box(minX + inset, minY + inset, maxX + 1 - inset, maxY + 1 - inset, h, MAT.CRATE);
      // cab / hood bump so vehicles read as cars, not crates
      if (!bus) box(minX + 0.25, minY + 0.15, minX + 0.7, maxY + 0.85, h + 0.25, MAT.ROCK);
      else box(minX + 0.15, minY + 0.12, minX + 1.1, maxY + 0.88, h + 0.2, MAT.ROCK);
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
      const icy = style === 'ice' || style === 'cove'; // no lava in these
      raise(vx - R, vy - R, vx + R, vy + R, (px, py) => {
        const d = Math.hypot(px - vx, py - vy), t = d / R;
        if (t >= 1) return null;
        if (t < rc) return [rim - (1 - t / rc) * 0.3 * H, icy ? MAT.ROCK : (t < rc * 0.75 ? MAT.LAVA : MAT.ROCK)]; // crater
        if (icy) return [H * (1 - t) ** 1.5 * (0.9 + 0.2 * noise(px * 2.5, py * 2.5)), MAT.ROCK];
        const ang = Math.atan2(py - vy, px - vx), streak = Math.sin(ang * 5 + d * 1.7 + H) > 0.94 && t < 0.6; // glowing lava runs
        return [H * (1 - t) ** 1.5 * (0.9 + 0.2 * noise(px * 2.5, py * 2.5)), streak ? MAT.LAVA : MAT.ROCK];
      });
      props.push({ type: style === 'cove' ? 'rock' : 'volcano', x: vx, y: vy, top: rim - 0.2 * H }); // cove rocks don't smoke
    }
  }

  for (let k = 0; k < TW * TH; k++) kind[k] = mat[k] === MAT.PIT ? 2 : hgt[k] > STEP_H ? 1 : 0;

  // volcanoes can spill into hut footprints after walls are placed — keep rooms open, then
  // add a solid peaked roof (fixed in the heightmap, not a turning billboard). Interior kind
  // stays walkable so you can go inside under the roof.
  for (const hut of props) {
    if (hut.type !== 'hut') continue;
    const hw = (hut.w || 2.2) / 2, hd = (hut.d || 2.2) / 2, t = 0.16;
    const wallH = hut.h, doorDir = hut.doorDir || 1;
    const look = COTTAGES[hut.style] || COTTAGES.witch, wallMat = look.wall, roofMat = look.roof;
    // (the heightmap only keeps a rough outline for things like the camera; walkHeight / ceilingAt
    // answer from houseSolids below)
    const x0 = hut.x - hw, y0 = hut.y - hd, x1 = hut.x + hw, y1 = hut.y + hd;
    const clear = (xa, ya, xb, yb) => {
      const i0 = Math.max(0, Math.floor(xa * RES)), i1 = Math.min(TW - 1, Math.ceil(xb * RES));
      const j0 = Math.max(0, Math.floor(ya * RES)), j1 = Math.min(TH - 1, Math.ceil(yb * RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * TW + i;
        if (mat[k] === MAT.PIT) continue;
        hgt[k] = 0; mat[k] = MAT.FLOOR;
      }
    };
    clear(x0 + t + 0.05, y0 + t + 0.05, x1 - t - 0.05, y1 - t - 0.05);
    if (doorDir > 0) {
      clear(hut.x - hw * 0.44, y1 - 0.05, hut.x + hw * 0.44, y1 + 0.55);
      box(x0 + t, y1 - t, hut.x - hw * 0.44, y1, wallH, wallMat);
      box(hut.x + hw * 0.44, y1 - t, x1 - t, y1, wallH, wallMat);
    } else {
      clear(hut.x - hw * 0.44, y0 - 0.55, hut.x + hw * 0.44, y0 + 0.05);
      box(x0 + t, y0, hut.x - hw * 0.44, y0 + t, wallH, wallMat);
      box(hut.x + hw * 0.44, y0, x1 - t, y0 + t, wallH, wallMat);
    }
    // A-frame roof peaked along X (ridge runs parallel to the doorway wall)
    const peakH = look.peak;
    raise(x0, y0, x1, y1, (px, py) => {
      if (px < x0 || px >= x1 || py < y0 || py >= y1) return null;
      const peak = wallH + peakH * (1 - Math.abs(px - hut.x) / hw);
      return peak > wallH + 0.02 ? [peak, roofMat] : null;
    });
    // the gable ends rise from the walls: keep them the wall's material, not the roof's
    const ring = 0.22;
    for (let j = Math.max(0, Math.floor(y0 * RES)); j <= Math.min(TH - 1, Math.ceil(y1 * RES)); j++)
      for (let i = Math.max(0, Math.floor(x0 * RES)); i <= Math.min(TW - 1, Math.ceil(x1 * RES)); i++) {
        const k = j * TW + i, px = (i + 0.5) / RES, py = (j + 0.5) / RES;
        const onWall = px - x0 < ring || x1 - px < ring || py - y0 < ring || y1 - py < ring;
        if (onWall && mat[k] === roofMat && hgt[k] > STEP_H) mat[k] = wallMat;
      }
    hut.roof = wallH + peakH;
  }

  for (let k = 0; k < TW * TH; k++) kind[k] = mat[k] === MAT.PIT ? 2 : hgt[k] > STEP_H ? 1 : 0;

  // open the room volume under each roof so walls stay solid but the inside is walkable
  for (const hut of props) {
    if (hut.type !== 'hut') continue;
    // inset past wall thickness so side walls stay kind=1 (don't hollow them out)
    const hw = hut.w / 2 - hut.t - 0.04, hd = hut.d / 2 - hut.t - 0.04;
    const i0 = Math.max(0, Math.floor((hut.x - hw) * RES)), i1 = Math.min(TW - 1, Math.ceil((hut.x + hw) * RES));
    const j0 = Math.max(0, Math.floor((hut.y - hd) * RES)), j1 = Math.min(TH - 1, Math.ceil((hut.y + hd) * RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * TW + i;
      if (mat[k] === MAT.PIT) continue;
      kind[k] = 0;
    }
    // punch a walkable doorway + porch through the door wall (roof height stays for looks)
    const doorHalf = hut.doorHalf || Math.min(hw * 0.7, 1.2);
    const doorDir = hut.doorDir || 1;
    const fullHd = (hut.d || 2.2) / 2;
    const ya = doorDir > 0 ? hut.y + fullHd - 0.55 : hut.y - fullHd - 1.0;
    const yb = doorDir > 0 ? hut.y + fullHd + 1.0 : hut.y - fullHd + 0.55;
    const di0 = Math.max(0, Math.floor((hut.x - doorHalf) * RES)), di1 = Math.min(TW - 1, Math.ceil((hut.x + doorHalf) * RES));
    const dj0 = Math.max(0, Math.floor(Math.min(ya, yb) * RES)), dj1 = Math.min(TH - 1, Math.ceil(Math.max(ya, yb) * RES));
    for (let j = dj0; j <= dj1; j++) for (let i = di0; i <= di1; i++) {
      const k = j * TW + i;
      if (mat[k] === MAT.PIT) continue;
      kind[k] = 0;
    }
  }

  if (style === 'castle') addCastleClimbTowers(hgt, kind, mat, props, MAP, RES, TW, TH);

  // no procedural scatter of extra bushes/crates — map ASCII already places the cover we want
  return { hgt, kind, mat, props, TW, TH, RES };
}

// Climbable castle towers: real stair treads (flat rectangles) + mid balconies + battlement deck.
// Axis-aligned flights so steps stay crisp in the heightmap and in the mesh.
function addCastleClimbTowers(hgt, kind, mat, props, MAP, RES, TW, TH) {
  const MW = MAP[0].length, MH = MAP.length;
  const rise = 0.26; // under STEP_H / client STEP so you can walk up without jumping

  const stampRect = (x0, y0, x1, y1, height, wall) => {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const i0 = Math.max(0, Math.floor(xa * RES)), i1 = Math.min(TW - 1, Math.ceil(xb * RES) - 1);
    const j0 = Math.max(0, Math.floor(ya * RES)), j1 = Math.min(TH - 1, Math.ceil(yb * RES) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * TW + i;
      if (mat[k] === MAT.PIT) continue;
      if (wall) {
        if (height >= hgt[k]) { hgt[k] = height; mat[k] = MAT.WALL; kind[k] = 1; }
        continue;
      }
      // never flatten another level, and never skip a step (keeps rise ≤ walk STEP)
      if (kind[k] === 0 && hgt[k] > 0.05) {
        if (height < hgt[k] - 0.02) continue;
        if (height > hgt[k] + rise * 1.15) continue;
      }
      hgt[k] = height;
      mat[k] = MAT.WALL;
      kind[k] = 0;
    }
  };

  const stepsN = (h0, h1) => Math.max(1, Math.ceil(Math.abs(h1 - h0) / rise));
  // Discrete flat treads along +X or +Y. Returns mesh boxes {x0,y0,x1,y1,z}.
  const stairRun = (x0, y0, x1, y1, h0, h1, halfW) => {
    const treads = [];
    const axisX = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    const span = axisX ? (x1 - x0) : (y1 - y0);
    const steps = stepsN(h0, h1);
    const dh = (h1 - h0) / steps;
    const ds = span / steps;
    for (let i = 0; i < steps; i++) {
      const h = h0 + (i + 1) * dh;
      if (axisX) {
        const a = x0 + i * ds, b = x0 + (i + 1) * ds;
        const xa = Math.min(a, b), xb = Math.max(a, b);
        const ya = y0 - halfW, yb = y0 + halfW;
        // pad slightly so adjacent treads share an edge in the heightmap (no 1-cell gaps)
        stampRect(xa - 0.02, ya, xb + 0.02, yb, h, false);
        treads.push({ x0: xa, y0: ya, x1: xb, y1: yb, z: h });
      } else {
        const a = y0 + i * ds, b = y0 + (i + 1) * ds;
        const ya = Math.min(a, b), yb = Math.max(a, b);
        const xa = x0 - halfW, xb = x0 + halfW;
        stampRect(xa, ya - 0.02, xb, yb + 0.02, h, false);
        treads.push({ x0: xa, y0: ya, x1: xb, y1: yb, z: h });
      }
    }
    return treads;
  };

  for (let cy = 2; cy < MH - 2; cy++) for (let cx = 2; cx < MW - 2; cx++) {
    if (MAP[cy][cx] !== 'T') continue;
    const cxw = cx + 0.5, cyw = cy + 0.5;
    const deckH = 5.4;
    const h1 = deckH / 3, h2 = (2 * deckH) / 3;
    const deckR = 0.85;
    const L = 1.55;
    const halfW = 0.42;
    const treads = [];

    // clear footprint (stairs + approach + balconies)
    for (let j = Math.max(0, Math.floor((cyw - 2.7) * RES)); j <= Math.min(TH - 1, Math.ceil((cyw + 2.7) * RES)); j++)
      for (let i = Math.max(0, Math.floor((cxw - 2.7) * RES)); i <= Math.min(TW - 1, Math.ceil((cxw + 2.7) * RES)); i++) {
        const px = (i + 0.5) / RES, py = (j + 0.5) / RES;
        if (Math.hypot(px - cxw, py - cyw) > 2.65) continue;
        const k = j * TW + i;
        if (mat[k] === MAT.PIT) continue;
        hgt[k] = 0; mat[k] = MAT.FLOOR; kind[k] = 0;
      }

    // battlement deck
    stampRect(cxw - deckR, cyw - deckR, cxw + deckR, cyw + deckR, deckH, false);
    treads.push({ x0: cxw - deckR, y0: cyw - deckR, x1: cxw + deckR, y1: cyw + deckR, z: deckH });

    // merlons
    for (const [ox, oy] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]])
      stampRect(cxw + ox - 0.18, cyw + oy - 0.18, cxw + ox + 0.18, cyw + oy + 0.18, deckH + 0.85, true);

    // approach pad (flat ground under first step)
    stampRect(cxw - L - halfW, cyw - L - 0.95, cxw - L + halfW, cyw - L, 0, false);

    // flights stop short of corners; landings own the turns so heights never skip
    const end = halfW;
    treads.push(...stairRun(cxw - L, cyw - L, cxw + L - end, cyw - L, 0, h1, halfW));
    stampRect(cxw + L - halfW, cyw - L - halfW, cxw + L + halfW, cyw - L + halfW, h1, false);
    treads.push({ x0: cxw + L - halfW, y0: cyw - L - halfW, x1: cxw + L + halfW, y1: cyw - L + halfW, z: h1 });
    stampRect(cxw - 0.75, cyw - L - 0.85, cxw + 0.75, cyw - L - halfW, h1, false);
    treads.push({ x0: cxw - 0.75, y0: cyw - L - 0.85, x1: cxw + 0.75, y1: cyw - L - halfW, z: h1 });

    treads.push(...stairRun(cxw + L, cyw - L + end, cxw + L, cyw + L - end, h1, h2, halfW));
    stampRect(cxw + L - halfW, cyw + L - halfW, cxw + L + halfW, cyw + L + halfW, h2, false);
    treads.push({ x0: cxw + L - halfW, y0: cyw + L - halfW, x1: cxw + L + halfW, y1: cyw + L + halfW, z: h2 });
    stampRect(cxw + L + halfW, cyw - 0.75, cxw + L + 0.85, cyw + 0.75, h2, false);
    treads.push({ x0: cxw + L + halfW, y0: cyw - 0.75, x1: cxw + L + 0.85, y1: cyw + 0.75, z: h2 });

    treads.push(...stairRun(cxw + L - end, cyw + L, cxw - L + end, cyw + L, h2, deckH, halfW));
    stampRect(cxw - L - halfW, cyw + L - halfW, cxw - L + halfW, cyw + L + halfW, deckH, false);
    treads.push({ x0: cxw - L - halfW, y0: cyw + L - halfW, x1: cxw - L + halfW, y1: cyw + L + halfW, z: deckH });
    // narrow L-bridge onto the deck (don't pave over the last stair treads)
    stampRect(cxw - L - halfW, cyw + deckR - 0.05, cxw - L + halfW, cyw + L + halfW, deckH, false);
    treads.push({ x0: cxw - L - halfW, y0: cyw + deckR - 0.05, x1: cxw - L + halfW, y1: cyw + L + halfW, z: deckH });
    stampRect(cxw - L - halfW, cyw + deckR - 0.05, cxw - deckR + 0.1, cyw + deckR + 0.2, deckH, false);
    treads.push({ x0: cxw - L - halfW, y0: cyw + deckR - 0.05, x1: cxw - deckR + 0.1, y1: cyw + deckR + 0.2, z: deckH });

    // low curb on deck rim
    for (let j = Math.max(0, Math.floor((cyw - deckR - 0.12) * RES)); j <= Math.min(TH - 1, Math.ceil((cyw + deckR + 0.12) * RES)); j++)
      for (let i = Math.max(0, Math.floor((cxw - deckR - 0.12) * RES)); i <= Math.min(TW - 1, Math.ceil((cxw + deckR + 0.12) * RES)); i++) {
        const px = (i + 0.5) / RES, py = (j + 0.5) / RES;
        const m = Math.max(Math.abs(px - cxw), Math.abs(py - cyw));
        if (m < deckR - 0.08 || m > deckR + 0.1) continue;
        const k = j * TW + i;
        if (mat[k] === MAT.PIT || kind[k] === 1) continue;
        if (Math.abs(hgt[k] - deckH) > 0.05) continue;
        hgt[k] = deckH + 0.18;
        mat[k] = MAT.WALL;
        kind[k] = 0;
      }

    props.push({ type: 'tower', x: cxw, y: cyw, h: deckH, r: 2.2, treads });
  }
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

// like groundAt, but blocked cells contribute 0 so tall walls don't lift the floor beside them
// (that bleed was making eye-height bullets die next to castle walls / cottage roofs).
// Sharp ledges (stairs, decks) also skip bilinear blend so a high tread doesn't fake a
// mid-air floor beside it and eat shots.
function openGroundAt(T, x, y) {
  const fx = x * T.RES - 0.5, fy = y * T.RES - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const g = (a, b) => {
    a = a < 0 ? 0 : a >= T.TW ? T.TW - 1 : a;
    b = b < 0 ? 0 : b >= T.TH ? T.TH - 1 : b;
    const k = b * T.TW + a;
    if (T.kind[k] === 1 || T.mat[k] === MAT.PIT) return 0;
    return T.hgt[k];
  };
  const h00 = g(i, j), h10 = g(i + 1, j), h01 = g(i, j + 1), h11 = g(i + 1, j + 1);
  const lo = Math.min(h00, h10, h01, h11), hi = Math.max(h00, h10, h01, h11);
  if (hi - lo > STEP_H) {
    const ci = Math.min(T.TW - 1, Math.max(0, Math.floor(x * T.RES)));
    const cj = Math.min(T.TH - 1, Math.max(0, Math.floor(y * T.RES)));
    return g(ci, cj);
  }
  return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
}

// Cottages are two storeys, which one height per spot can't hold, so inside a cottage's footprint
// walkHeight / ceilingAt ask houseSolids instead of the heightmap: the solid layers stacked at a spot
// (walls with the doorway and windows cut out, stairs, the upper floor, the roof), sorted bottom up.
// The ground floor is at 0 (cottage footprints are flattened).
function houseGrid(T) {
  if (T.houseGrid) return T.houseGrid;
  const MW = T.TW / T.RES, g = T.houseGrid = new Array(MW * (T.TH / T.RES));
  for (const p of T.props || []) {
    if (p.type !== 'hut') continue;
    for (let cy = p.y - p.d / 2; cy < p.y + p.d / 2; cy++) for (let cx = p.x - p.w / 2; cx < p.x + p.w / 2; cx++)
      g[Math.floor(cy) * MW + Math.floor(cx)] = p;
  }
  return g;
}

export function houseAt(T, x, y) {
  const MW = T.TW / T.RES, cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= MW || cy >= T.TH / T.RES) return null;
  return houseGrid(T)[cy * MW + cx] || null;
}

// Every window in cottage p. wall: 'side' (the x walls) or 'end' (the y walls, the door is in one);
// dir: which of the two (sign of x or y from the middle); at: its middle along the wall from the
// house middle; z: [bottom, top]. Both floors on the sides, upstairs pairs front and back, downstairs
// either side of the door and at the back (not behind the stairs, which are at the -x end).
export function houseWindows(p) {
  if (p.windows) return p.windows;
  const H = HOUSE, up = [H.floor + H.sill, H.floor + H.lintel], down = [H.sill, H.lintel];
  const pair = p.w / 2 * 0.55, low = p.doorHalf + 0.25 + H.win, list = [];
  for (const dir of [-1, 1]) {
    list.push({ wall: 'side', dir, at: 0, z: down }, { wall: 'side', dir, at: 0, z: up });
    for (const at of [-pair, pair]) list.push({ wall: 'end', dir, at, z: up });
  }
  if (low + H.win < p.w / 2 - p.t) for (const at of [-low, low]) list.push({ wall: 'end', dir: p.doorDir, at, z: down });
  list.push({ wall: 'end', dir: -p.doorDir, at: pair, z: down });
  return p.windows = list;
}

// window openings [bottom, top] in the wall at (x, y)
function windowsAt(p, x, y, side) {
  const dx = x - p.x, dy = y - p.y, out = [];
  for (const w of houseWindows(p))
    if ((w.wall === 'side') === side && Math.sign(side ? dx : dy) === w.dir && Math.abs((side ? dy : dx) - w.at) < HOUSE.win) out.push(w.z);
  return out;
}

// [[bottom, top], ...] solid layers at (x, y) inside cottage p, bottom up and not overlapping
export function houseSolids(p, x, y) {
  const H = HOUSE, hw = p.w / 2, hd = p.d / 2, ax = Math.abs(x - p.x), ay = Math.abs(y - p.y);
  const roofZ = p.h + p.peak * (1 - ax / hw); // ridge runs along y through the middle
  const roof = [roofZ - H.roofT, roofZ];
  const side = ax >= hw - p.t, endWall = ay >= hd - p.t;
  if (side || endWall) {
    // walls run up to the roof (into the gable on the end walls); the doorway is in the end wall facing mid-map
    let solids = [[0, roofZ]];
    const open = windowsAt(p, x, y, side);
    if (endWall && !side && (y - p.y) * p.doorDir > 0 && ax < p.doorHalf) open.push([0, H.door]);
    for (const [a, b] of open)
      solids = solids.flatMap(([lo, hi]) => b <= lo || a >= hi ? [[lo, hi]] : [[lo, a], [b, hi]].filter(([l, h]) => h > l));
    return solids;
  }
  const s = p.stairs;
  if (x >= s.x0 && x < s.x1 && y >= s.y0 && y < s.y1)
    return [[0, H.floor * (s.x1 - x) / (s.x1 - s.x0)], roof];
  return [[H.floor - H.slab, H.floor], roof];
}

// floor you stand on with feet at z: the top of the highest solid layer starting at or below z
export function walkHeight(T, x, y, z = 0) {
  const p = houseAt(T, x, y);
  if (p) {
    let floor = 0;
    for (const [lo, hi] of houseSolids(p, x, y)) { if (lo > z) break; floor = hi; }
    return floor;
  }
  if (kindAt(T, x, y) === 1) return groundAt(T, x, y);
  return openGroundAt(T, x, y);
}

// solid height for bullets / LOS / nades: same as the floor you'd stand on
export function solidAt(T, x, y, z = 0) {
  return walkHeight(T, x, y, z);
}

// bottom of the next solid above z (a cottage ceiling, lintel or roof), or null in the open
export function ceilingAt(T, x, y, z = 0) {
  const p = houseAt(T, x, y);
  if (!p) return null;
  for (const [lo] of houseSolids(p, x, y)) if (lo > z) return lo;
  return null;
}

export function kindAt(T, x, y) {
  const i = Math.floor(x * T.RES), j = Math.floor(y * T.RES);
  if (i < 0 || j < 0 || i >= T.TW || j >= T.TH) return 1;
  return T.kind[j * T.TW + i];
}

// Broom Battle: is a flier of radius r and height h, feet at z, blocked at (x, y)? By anything that
// reaches above their feet, a roof over their head, or the edge of the map (FLY.edge in from it)
export function flyBlocked(T, x, y, z, r, h, edge = 1.3) {
  const W = T.TW / T.RES, H = T.TH / T.RES;
  if (x < edge || y < edge || x > W - edge || y > H - edge) return true;
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const px = x + dx, py = y + dy;
    if (walkHeight(T, px, py, z + 0.1) > z + 0.1) return true;
    const c = ceilingAt(T, px, py, z + 0.1);
    if (c != null && c < z + h) return true;
  }
  return false;
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
