// Familiars (shared/progression.js FAMILIARS): little pixel-art pets, 12 x 12, that follow their
// witch around (render/gl/entities.js drawFamiliars). Rows are 6 wide and mirrored, or 12 as is.
// Two frames flap or hop; `ground` pets walk at your feet, the rest fly at your shoulder.
const N = 12;
function grid(rows) {
  if (rows.length !== N) throw new Error('familiar needs ' + N + ' rows, has ' + rows.length);
  return rows.map(r => r.length === N ? r : r + [...r].reverse().join(''));
}
function build({ frames, colors, emit = '', ground = false }) {
  const letters = ['.', ...Object.keys(colors)], pal = letters.map(k => colors[k] || null);
  const made = frames.map(rows => {
    const g = grid(rows);
    const px = (u, v) => { const x = Math.min(N - 1, u * N | 0), y = Math.min(N - 1, v * N | 0); return Math.max(0, letters.indexOf(g[y][x])); };
    return px;
  });
  return { frames: made, pal, emit: [...emit].map(k => letters.indexOf(k)), ground };
}
const E = '......';
const CROW = [[E, 'k.....', 'kk....', 'kkk.kk', '.kkkkk', '..kkwk', '...kky', '...kkk', '....kk', '....k.', E, E],
  [E, E, E, '....kk', 'kkkkkk', 'kkkkwk', '.kkkky', '...kkk', '....kk', '....k.', E, E]];
const ART = {
  cat: { ground: true, frames: [[E, E, '.o....', '.ko...', '.kko..', '.kkkkk', '.kkykk', '.kkkkp', '..kkkk', '.kkkkk', '.kkkkk', '..kk.k'],
    [E, E, '.o....', '.ko...', '.kko..', '.kkkkk', '.kkykk', '.kkkkp', '..kkkk', '.kkkkk', '.kkkkk', '..k.kk']],
    colors: { o: [60, 50, 70], k: [26, 22, 30], y: [255, 220, 60], p: [220, 120, 140] }, emit: 'y' },
  bat: { frames: [[E, 'k.....', 'kk...o', 'kkk.kk', '.kkkrk', '..kkkk', '...kkk', '....kk', E, E, E, E],
    [E, E, '.....o', '....kk', '...krk', '.kkkkk', 'kkkkkk', 'k..kkk', '....kk', E, E, E]],
    colors: { o: [60, 40, 70], k: [40, 30, 50], r: [255, 60, 60] }, emit: 'r' },
  frog: { ground: true, frames: [[E, E, E, E, '..ww..', '.wkwgg', '.ggggg', 'gggggg', 'gGggmm', 'gggggg', '.ggggg', 'gg..gg'],
    [E, E, '..ww..', '.wkwgg', '.ggggg', 'gggggg', 'gGggmm', 'gggggg', '.ggggg', 'g....g', E, E]],
    colors: { w: [240, 240, 220], k: [20, 20, 20], g: [80, 170, 60], G: [140, 210, 90], m: [40, 80, 30] } },
  crow: { frames: CROW, colors: { k: [24, 22, 30], w: [240, 240, 240], y: [240, 190, 50] } },
  goldCrow: { frames: CROW, colors: { k: [210, 162, 50], w: [255, 250, 220], y: [255, 240, 150] }, emit: 'w' },
  owl: { frames: [[E, '.b....', '.bb.bb', '.bbbbb', 'bbwwbb', 'bbwkby', 'bbbbbb', '.bBBBB', '.bBbBB', '..bbbb', '...y.y', E],
    [E, E, '.b....', '.bb.bb', 'bbbbbb', 'bbwwbb', 'bbwkby', 'bbbbbb', '.bBBBB', '.bBbBB', '..bbbb', '...y.y']],
    colors: { b: [120, 84, 50], B: [200, 170, 120], w: [250, 240, 200], k: [20, 14, 10], y: [240, 180, 40] }, emit: 'w' },
  wisp: { frames: [[E, '.....c', '....cc', '...ccc', '..cCCC', '.cCCCC', '.cCkCC', '.cCCCC', '..cCCC', '...cCC', '....cc', '.....c'],
    [E, E, '.....c', '....cc', '...cCC', '..cCCC', '.cCCCC', '.cCkCC', '.cCCCC', '..cCCC', '...ccc', '....cc']],
    colors: { c: [80, 200, 255], C: [180, 244, 255], k: [20, 40, 90] }, emit: 'cC' },
  skull: { frames: [[E, '..bbbb', '.bbbbb', 'bbbbbb', 'bbkkbb', 'bbkebb', 'bbbbbk', '.bbbbb', '..bkbk', '..bbbb', E, E],
    [E, E, '..bbbb', '.bbbbb', 'bbbbbb', 'bbkkbb', 'bbkebb', 'bbbbbk', '.bbbbb', '..bkbk', '..bbbb', E]],
    colors: { b: [232, 226, 206], k: [30, 24, 30], e: [120, 255, 140] }, emit: 'e' },
  pumpkin: { ground: true, frames: [[E, E, '.....g', E, '..nnnn', '.nnnnn', 'nnfnnn', 'nnnnnf', 'nnfnfn', 'nnnfff', '.nnnnn', '..NNNN'],
    [E, '.....g', E, '..nnnn', '.nnnnn', 'nnfnnn', 'nnnnnf', 'nnfnfn', 'nnnfff', '.nnnnn', '..NNNN', E]],
    colors: { g: [70, 120, 40], n: [235, 125, 30], N: [180, 80, 20], f: [255, 230, 90] }, emit: 'f' },
  kraken: { frames: [[E, '...ppp', '..pppp', '.ppppp', '.pyppp', '.ppppp', '..pppp', '.p.p.p', 'p.p..p', '.p..p.', 'p..p..', E],
    [E, E, '...ppp', '..pppp', '.ppppp', '.pyppp', '.ppppp', '..pppp', '..p.p.', '.p.p.p', '..p..p', E]],
    colors: { p: [150, 70, 180], y: [255, 222, 80] }, emit: 'y' },
};
export const PET_SPRITES = Object.fromEntries(Object.entries(ART).map(([k, a]) => [k, build(a)]));
