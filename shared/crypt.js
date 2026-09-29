// The Crypt's furniture for Wave Survival, read off its map (shared/levels.js): doors,
// sections, monster spawners, guns on the walls, elixirs and the mystery cauldron. Used by
// the server and the browser, so both put the doors in the same place.
//
// Doors are raised into the height grid at match start (closeDoor) and taken out when bought
// (openDoor), like conjured ramps (shared/spells.js). They're MAT.DOOR, which the terrain mesh
// skips: render/gl/doors.js draws them so they can vanish.
import { MAT, CEILING_H } from './terrain.js';
import { DOORS, WALL_BUYS, ELIXIRS } from './config.js';

const layouts = new Map();
const isDoor = c => c >= '1' && c <= '9';

export function cryptLayout(MAP) {
  if (layouts.has(MAP)) return layouts.get(MAP);
  const H = MAP.length, W = MAP[0].length, at = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? '#' : MAP[y][x];
  const doors = [], starts = [], spawners = [], buys = [], elixirs = [], boxes = [];
  // doors: each touching group of the same digit
  const doorOf = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (!isDoor(c) || doorOf[y * W + x] >= 0) continue;
    const id = doors.length, cells = [], stack = [[x, y]];
    doorOf[y * W + x] = id;
    while (stack.length) {
      const [a, b] = stack.pop();
      cells.push([a, b]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = a + dx, ny = b + dy;
        if (at(nx, ny) === c && doorOf[ny * W + nx] < 0) { doorOf[ny * W + nx] = id; stack.push([nx, ny]); }
      }
    }
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 };
    doors.push({ id, group: +c, cells, ...box, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2,
      cost: DOORS[c]?.cost ?? 1000, name: DOORS[c]?.name || 'Door', sides: [] });
  }
  // sections: open ground split by walls and doors
  const region = new Int16Array(W * H).fill(-1);
  let regions = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === '#' || isDoor(c) || region[y * W + x] >= 0) continue;
    const id = regions++, stack = [[x, y]];
    region[y * W + x] = id;
    while (stack.length) {
      const [a, b] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = a + dx, ny = b + dy, n = at(nx, ny);
        if (n === '#' || isDoor(n) || region[ny * W + nx] >= 0) continue;
        region[ny * W + nx] = id; stack.push([nx, ny]);
      }
    }
  }
  // which sections each door joins
  for (const d of doors) {
    const sides = new Set();
    for (const [x, y] of d.cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = region[(y + dy) * W + x + dx];
      if (r >= 0 && y + dy >= 0 && y + dy < H && x + dx >= 0 && x + dx < W) sides.add(r);
    }
    d.sides = [...sides];
  }
  // a wall-mounted thing faces out of the wall it's on
  const facing = (x, y) => {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (at(x + dx, y + dy) === '#') return { wx: dx, wy: dy };
    return { wx: 0, wy: 0 };
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y), spot = { x: x + 0.5, y: y + 0.5, region: region[y * W + x] };
    if (c === 'P') starts.push(spot);
    else if (c === 'Z') spawners.push(spot);
    else if (c === 'X') boxes.push({ ...spot, id: boxes.length });
    else if (WALL_BUYS[c]) buys.push({ ...spot, ...facing(x, y), id: buys.length, key: c, w: WALL_BUYS[c].w, cost: WALL_BUYS[c].cost });
    else if (ELIXIRS[c]) elixirs.push({ ...spot, id: elixirs.length, key: c, elixir: ELIXIRS[c].id, name: ELIXIRS[c].name, cost: ELIXIRS[c].cost });
  }
  const start = starts.length ? starts[0].region : 0;
  const out = { W, H, doors, starts, spawners, buys, elixirs, boxes, region, regions, start };
  layouts.set(MAP, out);
  return out;
}

// the sections you can reach from the start through the doors bought so far
export function openRegions(layout, opened) {
  const open = new Set([layout.start]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of layout.doors) {
      if (!opened.has(d.id) || !d.sides.some(s => open.has(s))) continue;
      for (const s of d.sides) if (!open.has(s)) { open.add(s); grew = true; }
    }
  }
  return open;
}

// raise a door into the height grid; returns what it covered, for openDoor
export function closeDoor(T, door) {
  const prev = [];
  const i0 = Math.floor(door.x0 * T.RES), i1 = Math.ceil(door.x1 * T.RES) - 1;
  const j0 = Math.floor(door.y0 * T.RES), j1 = Math.ceil(door.y1 * T.RES) - 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * T.TW + i;
    prev.push(k, T.hgt[k], T.kind[k], T.mat[k]);
    T.hgt[k] = CEILING_H; T.kind[k] = 1; T.mat[k] = MAT.DOOR;
  }
  return prev;
}
export function openDoor(T, prev) {
  for (let n = 0; n < prev.length; n += 4) {
    const k = prev[n];
    T.hgt[k] = prev[n + 1]; T.kind[k] = prev[n + 2]; T.mat[k] = prev[n + 3];
  }
}
