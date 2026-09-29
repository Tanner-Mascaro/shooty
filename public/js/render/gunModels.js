// The guns as little low-poly models built from boxes, shared by the first-person view
// (render/viewmodel.js) and the side-view sprites for guns on the ground, in other people's
// hands and on the hotbar (render/gunArt.js).
// Gun space: x right, y up, z forward (meters), with the sight line on y = 0 and the rear sight at
// z = 0. The newer guns (GUN_BASE in shared/config.js) are variants of the originals.
import { gunLook } from '/shared/config.js';
import { GUN_COLOR } from '../constants.js';

// [x0, x1, y0, y1, z0, z1, color] — colors: d dark, m mid, l light metal, b black, w wood,
// s steel, g glowing accent, x lens. `anim` names a part that moves (slide, pump, bolt).
const box = (x0, x1, y0, y1, z0, z1, c, anim) => ({ x0, x1, y0, y1, z0, z1, c, anim });
const sym = (hw, y0, y1, z0, z1, c, anim) => box(-hw, hw, y0, y1, z0, z1, c, anim);
// a notched rear sight: two posts either side of the view axis on a base
const notch = (z, w = 0.009, gap = 0.0035) => [sym(w, -0.009, -0.004, z - 0.005, z + 0.005, 'b'),
  box(-w, -gap, -0.004, 0.0015, z - 0.003, z + 0.003, 'b'), box(gap, w, -0.004, 0.0015, z - 0.003, z + 0.003, 'b')];
// accent strips down both sides of a part
const strips = (x, y0, y1, z0, z1) => [box(x, x + 0.002, y0, y1, z0, z1, 'g'), box(-x - 0.002, -x, y0, y1, z0, z1, 'g')];

const BASE = {
  pistol: [
    sym(0.014, -0.032, -0.004, -0.01, 0.19, 'm', 'slide'),            // slide
    ...notch(0.004, 0.008, 0.003).map(p => ({ ...p, anim: 'slide' })),
    sym(0.0025, -0.004, 0, 0.172, 0.182, 'l', 'slide'),               // front post
    ...strips(0.014, -0.022, -0.017, 0.03, 0.16).map(p => ({ ...p, anim: 'slide' })),
    sym(0.006, -0.024, -0.012, 0.19, 0.194, 'b', 'slide'),            // muzzle
    sym(0.013, -0.052, -0.032, 0.0, 0.18, 'd'),                       // frame
    sym(0.016, -0.1, -0.052, -0.03, 0.035, 'd'),                      // grip
    sym(0.016, -0.14, -0.1, -0.042, 0.022, 'd'),
    sym(0.0165, -0.135, -0.06, -0.043, -0.03, 'g'),                   // backstrap glow
    sym(0.003, -0.074, -0.068, 0.035, 0.085, 'b'),                    // trigger guard
    sym(0.003, -0.074, -0.052, 0.08, 0.086, 'b'),
    sym(0.003, -0.068, -0.054, 0.05, 0.056, 'l'),                     // trigger
  ],
  rifle: [
    sym(0.022, -0.08, -0.022, -0.4, -0.13, 'd'),                      // stock
    sym(0.023, -0.085, -0.075, -0.4, -0.2, 'b'),
    sym(0.014, -0.052, -0.026, -0.13, -0.07, 'b'),                    // buffer tube
    sym(0.025, -0.078, -0.015, -0.08, 0.15, 'm'),                     // receiver
    ...strips(0.025, -0.05, -0.044, -0.06, 0.12),
    sym(0.011, -0.015, -0.009, -0.06, 0.4, 'd'),                      // top rail
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => sym(0.012, -0.013, -0.008, 0.03 + i * 0.036, 0.042 + i * 0.036, 'b')),
    ...notch(0.004),
    sym(0.028, -0.07, -0.012, 0.15, 0.42, 'd'),                       // handguard
    ...strips(0.028, -0.045, -0.037, 0.17, 0.4),
    sym(0.012, -0.022, -0.012, 0.395, 0.425, 'b'),                    // front sight
    sym(0.0025, -0.012, 0, 0.405, 0.413, 'b'),
    sym(0.009, -0.046, -0.028, 0.42, 0.62, 'b'),                      // barrel
    sym(0.013, -0.05, -0.024, 0.6, 0.67, 'b'),                        // muzzle brake
    sym(0.013, -0.125, -0.078, 0.03, 0.1, 'd'),                       // curved mag, in two steps
    sym(0.013, -0.17, -0.125, 0.05, 0.118, 'd'),
    sym(0.016, -0.14, -0.078, -0.07, -0.025, 'd'),                    // grip
    sym(0.003, -0.1, -0.094, -0.025, 0.028, 'b'),                     // trigger guard
  ],
  smg: [
    sym(0.009, -0.034, -0.022, -0.22, -0.06, 'd'),                    // folded wire stock
    sym(0.024, -0.085, -0.02, -0.235, -0.215, 'd'),
    sym(0.024, -0.072, -0.01, -0.06, 0.2, 'm'),                       // receiver
    ...strips(0.024, -0.042, -0.035, -0.04, 0.18),
    ...notch(0.004),
    sym(0.012, -0.018, -0.01, 0.19, 0.215, 'b'),                      // hooded front sight
    sym(0.0025, -0.01, 0, 0.198, 0.206, 'b'),
    sym(0.019, -0.058, -0.02, 0.2, 0.3, 'd'),                         // barrel shroud
    sym(0.008, -0.046, -0.03, 0.3, 0.37, 'b'),                        // barrel
    sym(0.012, -0.21, -0.072, 0.07, 0.11, 'd'),                       // long straight mag
    sym(0.0125, -0.21, -0.2, 0.068, 0.112, 'g'),
    sym(0.015, -0.145, -0.072, -0.045, 0.0, 'd'),                     // grip
    sym(0.003, -0.1, -0.094, 0.0, 0.05, 'b'),
  ],
  shotgun: [
    sym(0.024, -0.1, -0.02, -0.42, -0.06, 'w'),                       // stock
    sym(0.025, -0.106, -0.1, -0.42, -0.2, 'b'),
    sym(0.028, -0.078, -0.012, -0.06, 0.16, 'm'),                     // receiver
    ...strips(0.028, -0.05, -0.042, -0.04, 0.14),
    sym(0.006, -0.012, -0.006, -0.04, 0.16, 'b'),                     // sight groove
    sym(0.012, -0.03, -0.006, 0.16, 0.62, 'b'),                       // barrel
    sym(0.011, -0.056, -0.032, 0.16, 0.56, 'b'),                      // mag tube
    sym(0.003, -0.006, 0, 0.6, 0.607, 'l'),                           // bead
    sym(0.025, -0.07, -0.022, 0.24, 0.4, 'w', 'pump'),                // pump
    ...[0, 1, 2, 3, 4].map(i => sym(0.0255, -0.066, -0.026, 0.26 + i * 0.03, 0.27 + i * 0.03, 'd', 'pump')),
    sym(0.016, -0.14, -0.078, -0.07, -0.025, 'w'),                    // grip
    sym(0.003, -0.1, -0.094, -0.025, 0.03, 'b'),
  ],
  sniper: [
    sym(0.024, -0.105, -0.03, -0.44, -0.06, 'd'),                     // stock
    sym(0.018, -0.03, -0.018, -0.36, -0.16, 'd'),                     // cheek rest
    sym(0.026, -0.08, -0.03, -0.06, 0.18, 'm'),                       // receiver
    ...strips(0.026, -0.058, -0.051, -0.04, 0.16),
    sym(0.008, -0.03, -0.014, 0.02, 0.04, 'b'), sym(0.008, -0.03, -0.014, 0.16, 0.18, 'b'), // scope rings
    sym(0.013, -0.013, 0.013, -0.02, 0.26, 'b'),                      // scope tube
    sym(0.02, -0.02, 0.02, -0.05, 0.02, 'd'),                         // eyepiece
    sym(0.024, -0.024, 0.024, 0.2, 0.28, 'd'),                        // objective bell
    sym(0.018, -0.018, 0.018, 0.28, 0.282, 'x'),                      // lens
    sym(0.026, -0.09, -0.036, 0.18, 0.45, 'd'),                       // fore-end
    sym(0.009, -0.056, -0.038, 0.45, 0.8, 'b'),                       // barrel
    sym(0.013, -0.06, -0.034, 0.78, 0.84, 'b'),                       // muzzle brake
    box(0.026, 0.06, -0.052, -0.042, 0.0, 0.014, 'l', 'bolt'),        // bolt handle
    box(0.056, 0.07, -0.058, -0.038, -0.004, 0.018, 'l', 'bolt'),
    sym(0.016, -0.115, -0.08, 0.06, 0.12, 'd'),                       // mag
    sym(0.016, -0.15, -0.08, -0.08, -0.03, 'd'),                      // grip
  ],
  // Hex Wand: wrapped grip, dark wood shaft, brass collar, a glowing gem at the tip
  wand: [
    sym(0.0105, -0.03, -0.008, -0.08, 0.05, 'b'),                     // grip wrap
    sym(0.008, -0.026, -0.011, 0.05, 0.25, 'w'),                      // shaft
    sym(0.012, -0.03, -0.007, 0.25, 0.27, 'l'),                       // collar
    sym(0.015, -0.034, -0.003, 0.27, 0.31, 'g'),                      // gem
    sym(0.006, -0.024, -0.013, 0.31, 0.325, 'g'),                     // gem point
  ],
  beam: [
    sym(0.022, -0.1, -0.028, -0.38, -0.08, 'd'),                      // stock
    sym(0.024, -0.072, -0.018, -0.08, 0.2, 'm'),                      // receiver
    ...strips(0.024, -0.048, -0.042, -0.05, 0.18),
    sym(0.028, -0.055, -0.02, 0.18, 0.42, 'd'),                       // shroud
    sym(0.01, -0.02, -0.01, 0.0, 0.08, 'g'),                          // optic rail glow
    sym(0.014, -0.014, 0.014, 0.02, 0.14, 'b'),                       // optic
    sym(0.01, -0.01, 0.01, 0.14, 0.142, 'x'),                         // lens
    sym(0.008, -0.042, -0.026, 0.42, 0.7, 'b'),                       // barrel
    sym(0.014, -0.048, -0.02, 0.68, 0.78, 'g'),                       // emitter coil
    sym(0.018, -0.018, 0.018, 0.76, 0.8, 'g'),                        // glowing muzzle
    sym(0.014, -0.13, -0.075, 0.04, 0.1, 'd'),                        // mag
    sym(0.0145, -0.128, -0.12, 0.042, 0.098, 'g'),
    sym(0.015, -0.145, -0.075, -0.06, -0.02, 'd'),                    // grip
    sym(0.003, -0.1, -0.094, -0.02, 0.03, 'b'),
  ],
  blade: [
    sym(0.012, -0.02, 0.02, -0.08, 0.035, 'd'),                       // handle
    ...[0, 1, 2].map(i => sym(0.0125, -0.021, 0.021, -0.06 + i * 0.03, -0.05 + i * 0.03, 'b')),
    sym(0.014, -0.022, 0.022, -0.095, -0.08, 'l'),                    // pommel
    sym(0.032, -0.024, 0.024, 0.035, 0.047, 'l'),                     // guard
    sym(0.003, -0.02, 0.022, 0.047, 0.14, 's'),                       // blade
    sym(0.003, -0.01, 0.018, 0.14, 0.17, 's'),
    sym(0.0025, 0.0, 0.012, 0.17, 0.19, 's'),
    sym(0.0035, 0.014, 0.022, 0.06, 0.135, 'g'),                      // glowing spine
  ],
  claws: [
    // monster forearm
    sym(0.028, -0.05, 0.04, -0.12, 0.02, 'd'),
    sym(0.032, -0.055, 0.045, -0.02, 0.08, 'm'),
    // knuckles
    ...[-0.028, -0.01, 0.01, 0.028].map(x => box(x - 0.01, x + 0.01, -0.02, 0.035, 0.07, 0.1, 'l')),
    // long claws
    ...[-0.028, -0.01, 0.01, 0.028].map((x, i) => box(x - 0.004, x + 0.004, -0.01, 0.03, 0.1, 0.22 + i * 0.01, 's')),
    ...[-0.028, -0.01, 0.01, 0.028].map(x => box(x - 0.003, x + 0.003, 0.005, 0.025, 0.16, 0.26, 'g')),
  ],
  deagle: [
    sym(0.018, -0.038, -0.002, -0.02, 0.22, 'm', 'slide'),            // chunky slide
    ...notch(0.004, 0.01, 0.0035).map(p => ({ ...p, anim: 'slide' })),
    sym(0.003, -0.002, 0.002, 0.2, 0.212, 'l', 'slide'),
    ...strips(0.018, -0.026, -0.02, 0.02, 0.18).map(p => ({ ...p, anim: 'slide' })),
    sym(0.01, -0.03, -0.01, 0.22, 0.235, 'b', 'slide'),               // thick muzzle
    sym(0.016, -0.06, -0.038, -0.02, 0.2, 'd'),
    sym(0.02, -0.12, -0.06, -0.04, 0.04, 'd'),                        // wide grip
    sym(0.02, -0.16, -0.12, -0.05, 0.03, 'd'),
    sym(0.0205, -0.15, -0.07, -0.052, -0.035, 'g'),
    sym(0.004, -0.085, -0.078, 0.03, 0.1, 'b'),
    sym(0.004, -0.078, -0.06, 0.06, 0.07, 'l'),
  ],
  revolver: [
    sym(0.015, -0.04, -0.01, 0.05, 0.22, 'm'),                        // barrel shroud
    sym(0.008, -0.032, -0.018, 0.22, 0.28, 'b'),                      // long barrel
    sym(0.003, -0.01, 0, 0.265, 0.275, 'l'),                          // front post
    sym(0.022, -0.055, -0.01, -0.02, 0.08, 'd'),                      // frame
    sym(0.028, -0.07, -0.015, 0.0, 0.09, 'm'),                        // cylinder
    ...[0, 1, 2, 3].map(i => sym(0.029, -0.068 + i * 0.012, -0.058 + i * 0.012, 0.015, 0.075, 'b')),
    sym(0.018, -0.13, -0.07, -0.05, 0.02, 'w'),                       // wood grip
    sym(0.0185, -0.125, -0.08, -0.052, -0.04, 'g'),
    sym(0.004, -0.09, -0.082, -0.01, 0.05, 'b'),
    box(0.018, 0.04, -0.05, -0.035, -0.02, 0.0, 'l'),                 // hammer
  ],
  burst: [
    sym(0.02, -0.075, -0.02, -0.32, -0.1, 'd'),                       // short stock
    sym(0.021, -0.08, -0.07, -0.32, -0.18, 'b'),
    sym(0.024, -0.072, -0.012, -0.08, 0.2, 'm'),                      // receiver
    ...strips(0.024, -0.048, -0.042, -0.05, 0.16),
    ...notch(0.004),
    sym(0.01, -0.014, -0.008, -0.04, 0.35, 'd'),                      // rail
    sym(0.022, -0.06, -0.014, 0.2, 0.4, 'd'),                         // short handguard
    ...strips(0.022, -0.04, -0.034, 0.22, 0.38),
    sym(0.008, -0.04, -0.024, 0.4, 0.52, 'b'),                        // barrel
    sym(0.012, -0.044, -0.02, 0.5, 0.56, 'b'),                        // brake
    sym(0.014, -0.16, -0.072, 0.04, 0.11, 'd'),                       // mag
    sym(0.0145, -0.16, -0.15, 0.038, 0.112, 'g'),
    sym(0.015, -0.135, -0.072, -0.06, -0.02, 'd'),
    sym(0.003, -0.095, -0.088, -0.02, 0.03, 'b'),
  ],
  carbine: [
    sym(0.018, -0.07, -0.02, -0.28, -0.08, 'd'),                      // compact stock
    sym(0.019, -0.074, -0.065, -0.28, -0.16, 'b'),
    sym(0.022, -0.068, -0.012, -0.06, 0.18, 'm'),
    ...strips(0.022, -0.045, -0.039, -0.04, 0.14),
    ...notch(0.004),
    sym(0.02, -0.055, -0.014, 0.18, 0.38, 'd'),                       // slim handguard
    ...strips(0.02, -0.038, -0.032, 0.2, 0.36),
    sym(0.007, -0.038, -0.024, 0.38, 0.52, 'b'),
    sym(0.011, -0.12, -0.068, 0.02, 0.09, 'd'),                       // short mag
    sym(0.0115, -0.12, -0.112, 0.018, 0.092, 'g'),
    sym(0.014, -0.13, -0.068, -0.055, -0.015, 'd'),
    sym(0.003, -0.09, -0.084, -0.015, 0.025, 'b'),
  ],
  uzi: [
    sym(0.022, -0.07, -0.008, -0.04, 0.18, 'm'),                      // boxy receiver
    ...strips(0.022, -0.04, -0.034, -0.02, 0.16),
    ...notch(0.002, 0.007, 0.0025),
    sym(0.01, -0.04, -0.02, 0.18, 0.28, 'b'),                         // stubby barrel
    sym(0.014, -0.044, -0.016, 0.26, 0.3, 'b'),
    sym(0.016, -0.2, -0.07, 0.04, 0.12, 'd'),                         // grip mag
    sym(0.0165, -0.2, -0.19, 0.038, 0.122, 'g'),
    sym(0.018, -0.1, -0.07, -0.02, 0.05, 'd'),
    sym(0.003, -0.085, -0.078, 0.02, 0.06, 'b'),
    box(-0.04, -0.022, -0.03, -0.01, -0.08, -0.02, 'd'),              // side cocking handle
  ],
  crossbow: [
    sym(0.02, -0.08, -0.02, -0.28, -0.05, 'w'),                       // stock
    sym(0.022, -0.09, -0.075, -0.28, -0.14, 'd'),
    sym(0.024, -0.06, -0.01, -0.05, 0.25, 'm'),                       // body
    ...strips(0.024, -0.04, -0.034, -0.02, 0.2),
    sym(0.006, -0.012, 0.0, -0.02, 0.35, 'b'),                        // rail / groove
    box(-0.16, -0.024, -0.02, 0.02, 0.22, 0.28, 'd'),                 // left limb
    box(0.024, 0.16, -0.02, 0.02, 0.22, 0.28, 'd'),                   // right limb
    box(-0.17, -0.15, -0.005, 0.01, 0.24, 0.3, 'g'),                  // limb tips glow
    box(0.15, 0.17, -0.005, 0.01, 0.24, 0.3, 'g'),
    sym(0.004, -0.018, -0.006, 0.1, 0.42, 'l', 'bolt'),               // bolt / quarrel
    sym(0.01, -0.022, -0.01, 0.4, 0.46, 'b', 'bolt'),                 // broadhead
    sym(0.014, -0.13, -0.06, -0.05, 0.0, 'w'),                        // grip
    sym(0.003, -0.09, -0.084, -0.01, 0.04, 'b'),
  ],
  lmg: [
    sym(0.012, -0.04, -0.025, -0.28, -0.08, 'd'),                     // skeletal stock
    sym(0.028, -0.09, -0.015, -0.1, 0.22, 'm'),                       // heavy receiver
    ...strips(0.028, -0.055, -0.048, -0.06, 0.18),
    ...notch(0.004),
    sym(0.032, -0.08, -0.02, 0.22, 0.4, 'd'),                         // bulky handguard
    ...strips(0.032, -0.05, -0.042, 0.24, 0.38),
    sym(0.01, -0.05, -0.028, 0.4, 0.58, 'b'),                         // barrel
    sym(0.016, -0.055, -0.024, 0.55, 0.62, 'b'),                      // muzzle
    sym(0.02, -0.22, -0.09, 0.02, 0.14, 'd'),                         // box mag
    sym(0.0205, -0.22, -0.21, 0.018, 0.142, 'g'),
    sym(0.018, -0.145, -0.09, -0.07, -0.02, 'd'),
    sym(0.004, -0.105, -0.098, -0.02, 0.04, 'b'),
    box(0.028, 0.05, -0.04, -0.02, 0.05, 0.12, 'l'),                  // carry handle stub
  ],
};


// --- the newer guns: an original's parts, reshaped. `wood` turns dark parts matching a test into
// walnut, `drop` removes parts, `add` bolts new ones on, `scale` stretches the whole gun ---
function variant(base, { scale = [1, 1, 1], wood = null, recolor = {}, drop = null, add = [] }) {
  const [sx, sy, sz] = scale;
  const parts = BASE[base].filter(p => !(drop && drop(p))).map(p => ({
    ...p, c: wood && p.c === 'd' && wood(p) ? 'w' : recolor[p.c] || p.c,
    x0: p.x0 * sx, x1: p.x1 * sx, y0: p.y0 * sy, y1: p.y1 * sy, z0: p.z0 * sz, z1: p.z1 * sz,
  }));
  return [...parts, ...add];
}
const isStock = p => p.z1 <= -0.05, isFore = p => p.z0 >= 0.14 && p.y0 > -0.1;
const scopeParts = [
  sym(0.007, -0.028, -0.014, 0.02, 0.04, 'b'), sym(0.007, -0.028, -0.014, 0.18, 0.2, 'b'),
  sym(0.012, -0.012, 0.012, -0.01, 0.26, 'b'), sym(0.018, -0.018, 0.018, -0.04, 0.01, 'd'),
  sym(0.02, -0.02, 0.02, 0.21, 0.27, 'd'), sym(0.015, -0.015, 0.015, 0.27, 0.272, 'x'),
];
const VARIANTS = {
  derringer: variant('pistol', { scale: [1.15, 0.9, 0.6], wood: p => p.y1 <= -0.05, recolor: { g: 'l' } }),
  flintlock: variant('revolver', { scale: [0.9, 1, 1.3], recolor: { d: 'w', m: 'w', g: 'l' },
    add: [box(0.012, 0.032, -0.03, 0.0, 0.0, 0.03, 'l'), box(0.02, 0.03, 0.0, 0.02, 0.005, 0.02, 'b')] }), // the flint lock
  autopistol: variant('pistol', { add: [sym(0.012, -0.21, -0.14, -0.036, 0.016, 'd'), sym(0.0125, -0.21, -0.2, -0.037, 0.017, 'b')] }), // long mag
  assault: variant('rifle', { wood: p => isStock(p) || isFore(p) }),
  dmr: variant('carbine', { scale: [1, 1, 1.12], wood: isStock, add: scopeParts }),
  marksman: variant('sniper', { wood: p => isStock(p) || (p.z0 >= 0.18 && p.y0 > -0.1) }),
  dragon: variant('sniper', { scale: [1.2, 1.15, 1.15], add: [sym(0.02, -0.075, -0.03, 0.9, 1.0, 'b'), sym(0.024, -0.07, -0.036, 0.93, 0.96, 'd')] }),
  doublebarrel: variant('shotgun', { drop: p => p.anim === 'pump' || (p.c === 'b' && p.y1 < -0.02 && p.z1 > 0.5),
    add: [box(0.001, 0.014, -0.036, -0.008, 0.16, 0.6, 'b'), box(-0.014, -0.001, -0.036, -0.008, 0.16, 0.6, 'b'), sym(0.02, -0.06, -0.034, 0.2, 0.42, 'w')] }),
  autoshotgun: variant('shotgun', { recolor: { w: 'd' }, drop: p => p.anim === 'pump',
    add: [sym(0.018, -0.16, -0.075, 0.03, 0.13, 'd'), sym(0.0185, -0.16, -0.15, 0.028, 0.132, 'g'), sym(0.024, -0.07, -0.03, 0.24, 0.42, 'd')] }),
  blunderbuss: variant('shotgun', { recolor: { m: 'w', b: 'l' }, drop: p => p.anim === 'pump' || (p.y1 < -0.03 && p.z0 >= 0.15 && p.c === 'b'),
    add: [sym(0.02, -0.042, 0.002, 0.52, 0.58, 'l'), sym(0.03, -0.052, 0.012, 0.58, 0.64, 'l'), sym(0.022, -0.07, -0.03, 0.18, 0.46, 'w')] }), // flared brass muzzle
  gatling: variant('lmg', { drop: p => p.c === 'b' && p.z0 >= 0.4,
    add: [...[0, 1, 2, 3, 4, 5].map(i => {
      const a = i / 6 * Math.PI * 2, cx = Math.cos(a) * 0.018, cy = -0.04 + Math.sin(a) * 0.018;
      return box(cx - 0.005, cx + 0.005, cy - 0.005, cy + 0.005, 0.4, 0.7, 'b');
    }), sym(0.03, -0.07, -0.01, 0.46, 0.48, 'l'), sym(0.03, -0.07, -0.01, 0.64, 0.66, 'l')] }),
  reaper: variant('smg', { recolor: { g: 'l' }, add: [sym(0.016, -0.054, -0.022, 0.36, 0.54, 'b'), sym(0.017, -0.05, -0.026, 0.52, 0.54, 'd')] }), // suppressor
  swarm: variant('smg', { drop: p => p.y0 <= -0.2, add: [sym(0.02, -0.02, -0.012, -0.04, 0.19, 'd'), sym(0.012, -0.13, -0.072, 0.07, 0.11, 'd')] }),
  tommy: variant('smg', { wood: p => isStock(p) || p.y1 <= -0.07, drop: p => p.y0 <= -0.2,
    add: [box(-0.03, 0.03, -0.15, -0.075, 0.035, 0.12, 'd'), box(-0.031, 0.031, -0.12, -0.105, 0.05, 0.105, 'l'), sym(0.016, -0.08, -0.05, 0.26, 0.32, 'w')] }), // drum and foregrip
  staff: variant('wand', { scale: [1.15, 1.15, 1.7] }),
  bow: variant('crossbow', { recolor: { m: 'w', d: 'w' } }),
};
export const MODELS = { ...BASE, ...VARIANTS };
export const modelFor = held => MODELS[held] || MODELS[gunLook(held)];
export const VARIANT_SCALE = { derringer: 0.6, flintlock: 1.3, dmr: 1.12, dragon: 1.15, staff: 1.7 }; // how much longer (muzzle flash)

// gunmetal, black, walnut and steel, the same on every map. The gun's own color is only a hint on
// its accents, except for the magic ones, which glow
const MAGIC = new Set(['wand', 'beam', 'staff']);
export function gunPalette(held, pulse = 1) {
  const accent = GUN_COLOR[held] || [200, 200, 210], magic = MAGIC.has(held);
  const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
  return { d: [36, 38, 43], m: [62, 66, 73], l: [122, 128, 138], b: [17, 18, 21], w: [110, 68, 40], s: [178, 184, 194],
    g: magic ? accent.map(c => c * pulse) : mix([96, 100, 108], accent, 0.35), x: [110, 200, 255] };
}
