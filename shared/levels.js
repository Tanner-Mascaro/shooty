// Level layouts. Maps are point-symmetric: only the top half is written out and the
// bottom half is the top rotated 180°, so both spawns are fair.
//
//   #  wall          .  ground
//   L  pit (lava / acid / bog depending on the level's theme)
//   S  sniper pad    G  shotgun pad    M  SMG pad    H  health pad
//
// To add a level: add a map here, a name in LEVEL_NAMES, a theme in public/js/themes.js,
// and a button in public/index.html.

function mirror(half) {
  return half.concat(half.slice().reverse().map(r => r.split('').reverse().join('')));
}

export const LEVELS = {
  hell: mirror([
    "############################",
    "#......H...................#",
    "#.........................S#",
    "#...##........#.......##...#",
    "#...#.........#........#...#",
    "#..........LL.......#......#",
    "#..........LL.......#......#",
    "#..##............LL........#",
    "#..#.............LL...##...#",
    "#...M...#..................#",
    "#.......#.....###..........#",
    "#...LL.......#......#...L..#",
    "#...LL....##........#...L..#",
    "#............G.............#",
  ]),
  robot: mirror([
    "############################",
    "#.........................S#",
    "#..#....#....#....#....#...#",
    "#..........................#",
    "#..#..######...######..#...#",
    "#.....#..........LLL.#.....#",
    "#..#..#..........LLL.#.#...#",
    "#...M......##.....H........#",
    "#..#....#.....#....#...#...#",
    "#......###....#............#",
    "#..#..........#..###...#...#",
    "#......LL..........#.......#",
    "#..#...LL....##....#...#...#",
    "#............G.............#",
  ]),
  witch: mirror([
    "############################",
    "#............H............S#",
    "#..#.....#.......#.....#...#",
    "#......LL.........##.......#",
    "#..#...LL..#...........#...#",
    "#..........#.....#.........#",
    "#.##.....M.....#...LL..##..#",
    "#..............#...LL......#",
    "#......#...##..............#",
    "#..#...#.........#.....#...#",
    "#..........LLL.............#",
    "#....##....LLL....#..##....#",
    "#..#..............#........#",
    "#.............G............#",
  ]),
};

export const LEVEL_NAMES = { hell: 'HELL', robot: 'ROBOT FACTORY', witch: 'WITCH SWAMP' };

export const MW = LEVELS.hell[0].length, MH = LEVELS.hell.length;
for (const k in LEVELS)
  if (LEVELS[k].length !== MH || LEVELS[k].some(r => r.length !== MW)) throw new Error('Level ' + k + ' must be ' + MW + 'x' + MH);
