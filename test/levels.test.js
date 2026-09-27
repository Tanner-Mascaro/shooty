import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { LEVELS, FEATURED_LEVELS, MW, MH } from '../shared/levels.js';
import { walkHeight, kindAt } from '../shared/terrain.js';
import { HARDPOINT_SITE_COUNT } from '../shared/config.js';

const hub = { nextId: 0, name: p => p.name, who: p => p.name, send() {}, sendRaw() {}, record() {}, afterMatch() {}, closeRoom() {} };

for (const level of FEATURED_LEVELS) {
  test(`${level} is a full, fair, playable map`, () => {
    const map = LEVELS[level];
    // point-symmetric, so neither side of the map is better
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const a = map[y][x], b = map[MH - 1 - y][MW - 1 - x];
      assert.equal(a, b, `(${x}, ${y}) ${a} vs ${b}`);
    }
    // every open square can be reached from the corner
    const seen = new Set(['1,1']), queue = [[1, 1]];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (map[ny]?.[nx] && map[ny][nx] !== '#' && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); queue.push([nx, ny]); }
      }
    }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++)
      if (map[y][x] !== '#') assert.ok(seen.has(x + ',' + y), `(${x}, ${y}) is walled off`);

    const room = new Room(hub, 'MAPS', true);
    room.setLevel(level);
    assert.equal(room.hardpointSites.length, HARDPOINT_SITE_COUNT);
    assert.ok(room.pickups.length > 40);
    const spot = room.spawnPos([]);
    assert.ok(spot && kindAt(room.T, spot.x, spot.y) === 0);
    // cottage floors are walkable ground, not roof
    for (const hut of room.T.props.filter(p => p.type === 'hut'))
      assert.equal(walkHeight(room.T, hut.x, hut.y, 0), 0, `${level} cottage at ${hut.x}, ${hut.y}`);
  });
}
