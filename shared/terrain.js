// Heightmap built from a level map. Used for rendering, movement, bullets and pickups
// on both the server and the browser, so they always agree.

// kind: 0 = ground, 1 = wall, 2 = pit
export function buildTerrain(MAP, RES) {
  const MW = MAP[0].length, MH = MAP.length, TW = MW * RES, TH = MH * RES;
  const hgt = new Float32Array(TW * TH), kind = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const cx = Math.floor(i / RES), cy = Math.floor(j / RES), c = MAP[cy][cx], k = j * TW + i;
    if (c === '#') {
      const edge = cx === 0 || cy === 0 || cx === MW - 1 || cy === MH - 1;
      hgt[k] = edge ? 2.8 : 1.6; kind[k] = 1;
    } else if (c === 'L') { hgt[k] = -0.35; kind[k] = 2; }
  }
  return { hgt, kind, TW, TH, RES };
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
  const kinds = { S: 'sniper', G: 'shotgun', M: 'smg', H: 'health' }, out = [];
  for (let y = 0; y < MAP.length; y++)
    for (let x = 0; x < MAP[y].length; x++)
      if (kinds[MAP[y][x]]) out.push({ x: x + 0.5, y: y + 0.5, weapon: kinds[MAP[y][x]] });
  return out;
}
