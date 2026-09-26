// The first-person gun: small low-poly models built from boxes, rasterized with a depth buffer into
// a low-res pixel buffer (the same size as the world's) and scaled up, so it matches the pixel look.
// Gun space: x right, y up, z forward (meters), with the sight line on y = 0 and the rear sight at
// z = 0 — so aiming down sights just puts that origin on the view axis and the sights line up.
import { S } from '../state.js';
import { GUN_COLOR } from '../constants.js';
import { ctx, view, pk } from './canvas.js';

const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
let img = null, pix = null, zb = null;
function fitBuffer() {
  const RW = Math.min(480, Math.round(view.W / 2));
  const RH = Math.max(1, Math.round(RW * view.H / view.W));
  if (img && img.width === RW && img.height === RH) return;
  buf.width = RW; buf.height = RH;
  img = bctx.createImageData(RW, RH);
  pix = new Uint32Array(img.data.buffer);
  zb = new Float32Array(RW * RH);
  fitBuffer._RW = RW; fitBuffer._RH = RH;
}
const vmW = () => fitBuffer._RW || buf.width;
const vmH = () => fitBuffer._RH || buf.height;

const VM_FOV = 1.2, NEAR = 0.03; // the gun has its own field of view, so scoping doesn't warp it

// [x0, x1, y0, y1, z0, z1, color] — colors: d dark, m mid, l light metal, b black, w wood,
// s steel, g glowing accent, x lens. `anim` names a part that moves (slide, pump, bolt).
const box = (x0, x1, y0, y1, z0, z1, c, anim) => ({ x0, x1, y0, y1, z0, z1, c, anim });
const sym = (hw, y0, y1, z0, z1, c, anim) => box(-hw, hw, y0, y1, z0, z1, c, anim);
// a notched rear sight: two posts either side of the view axis on a base
const notch = (z, w = 0.009, gap = 0.0035) => [sym(w, -0.009, -0.004, z - 0.005, z + 0.005, 'b'),
  box(-w, -gap, -0.004, 0.0015, z - 0.003, z + 0.003, 'b'), box(gap, w, -0.004, 0.0015, z - 0.003, z + 0.003, 'b')];
// accent strips down both sides of a part
const strips = (x, y0, y1, z0, z1) => [box(x, x + 0.002, y0, y1, z0, z1, 'g'), box(-x - 0.002, -x, y0, y1, z0, z1, 'g')];

const MODELS = {
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

// where each gun sits: hip (x, y, z, yaw, cant) and aimed (z only: x = y = 0 lines the sights up)
const HIP = {
  pistol:   [0.08, -0.06, 0.24, -0.06, 0.12],
  deagle:   [0.085, -0.062, 0.24, -0.06, 0.12],
  revolver: [0.088, -0.064, 0.24, -0.06, 0.14],
  rifle:    [0.1, -0.068, 0.22, -0.08, 0.18],
  burst:    [0.1, -0.068, 0.22, -0.08, 0.18],
  carbine:  [0.098, -0.066, 0.22, -0.08, 0.16],
  smg:      [0.1, -0.066, 0.22, -0.08, 0.18],
  uzi:      [0.095, -0.062, 0.22, -0.07, 0.14],
  lmg:      [0.105, -0.07, 0.22, -0.08, 0.2],
  shotgun:  [0.1, -0.068, 0.22, -0.08, 0.18],
  sniper:   [0.1, -0.07, 0.23, -0.08, 0.18],
  crossbow: [0.1, -0.072, 0.23, -0.08, 0.16],
  beam:     [0.1, -0.068, 0.22, -0.08, 0.16],
  blade:    [0.11, -0.085, 0.24, -0.25, 0],
  claws:    [0.12, -0.09, 0.22, -0.15, 0.1],
};
const ADS_Z = { pistol: 0.34, deagle: 0.34, revolver: 0.34, rifle: 0.3, burst: 0.3, carbine: 0.3, smg: 0.3, uzi: 0.32, lmg: 0.28, crossbow: 0.32, beam: 0.34 };
const MUZZLE = {
  pistol: [0, -0.018, 0.2], deagle: [0, -0.02, 0.235], revolver: [0, -0.025, 0.28],
  rifle: [0, -0.037, 0.67], burst: [0, -0.032, 0.56], carbine: [0, -0.031, 0.52],
  smg: [0, -0.038, 0.37], uzi: [0, -0.03, 0.3], lmg: [0, -0.04, 0.62],
  shotgun: [0, -0.018, 0.62], sniper: [0, -0.047, 0.84], crossbow: [0, -0.012, 0.46], beam: [0, -0.0, 0.8],
};

// light comes from above and a little to the left; lit per face, in the gun's own frame
const LIGHT = { py: 1.25, ny: 0.45, px: 0.72, nx: 0.95, pz: 0.6, nz: 0.85 };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const METAL = { hell: ['#2a2022', '#4a383a', '#6e5656'], robot: ['#262b33', '#46505e', '#6c7888'], witch: ['#20241c', '#3a4232', '#5a6450'],
  haunt: ['#241f18', '#443c2e', '#665a44'], ice: ['#1e2834', '#3a4a5c', '#5c7088'], castle: ['#242018', '#40382c', '#5e5244'] };

let ads = 0, lastT = 0;
export const aimAmount = () => ads; // 0 at the hip .. 1 fully aimed

// rotate a gun-space point by roll, then pitch, then yaw, and move it into place
function xf(p, t) {
  let [x, y, z] = p;
  [x, y] = [x * t.cr + y * t.sr, -x * t.sr + y * t.cr];
  [y, z] = [y * t.cp + z * t.sp, -y * t.sp + z * t.cp];
  [x, z] = [x * t.cy + z * t.sy, -x * t.sy + z * t.cy];
  return [x + t.x, y + t.y, z + t.z];
}

function tri(a, b, c, col, bb) {
  const W = vmW(), H = vmH();
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  if (x0 > x1 || y0 > y1) return;
  bb[0] = Math.min(bb[0], x0); bb[1] = Math.max(bb[1], x1); bb[2] = Math.min(bb[2], y0); bb[3] = Math.max(bb[3], y1);
  const inv = 1 / area;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0])) * inv;
      const w1 = ((a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0])) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const iz = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * W + x;
      if (iz > zb[i]) { zb[i] = iz; pix[i] = col; }
    }
  }
}

// clip a camera-space polygon to z >= NEAR, project it and fill it
function face(pts, col, F, bb) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if (p[2] >= NEAR) out.push(p);
    if ((p[2] >= NEAR) !== (q[2] >= NEAR)) {
      const t = (NEAR - p[2]) / (q[2] - p[2]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, NEAR]);
    }
  }
  if (out.length < 3) return;
  const cx = vmW() / 2, cy = vmH() / 2;
  const s = out.map(([x, y, z]) => [cx + x / z * F, cy - y / z * F, 1 / z]);
  for (let i = 1; i < s.length - 1; i++) tri(s[0], s[i], s[i + 1], col, bb);
}

// the six faces of a box: corner indices (bit 0 = x1, 1 = y1, 2 = z1) and the outward normal
const FACES = [[[0, 2, 6, 4], 'nx', [-1, 0, 0]], [[1, 5, 7, 3], 'px', [1, 0, 0]], [[0, 4, 5, 1], 'ny', [0, -1, 0]],
  [[2, 3, 7, 6], 'py', [0, 1, 0]], [[0, 1, 3, 2], 'nz', [0, 0, -1]], [[4, 6, 7, 5], 'pz', [0, 0, 1]]];

function drawModel(parts, t, F, pal, offs) {
  const bb = [1e9, -1e9, 1e9, -1e9];
  for (const b of parts) {
    const dz = b.anim ? offs[b.anim] || 0 : 0;
    const corners = [];
    for (let k = 0; k < 8; k++) corners.push(xf([k & 1 ? b.x1 : b.x0, k & 2 ? b.y1 : b.y0, (k & 4 ? b.z1 : b.z0) + dz], t));
    const base = pal[b.c], lit = b.c === 'g' || b.c === 'x';
    for (const [idx, key, n] of FACES) {
      const q = idx.map(i => corners[i]);
      // back-face cull: the face's normal (rotated) must point toward the eye
      const o = xf([0, 0, 0], t), nn = xf(n, t);
      const nx = nn[0] - o[0], ny = nn[1] - o[1], nz = nn[2] - o[2];
      if (nx * q[0][0] + ny * q[0][1] + nz * q[0][2] >= 0) continue;
      const f = lit ? 1 : LIGHT[key];
      face(q, pk(base[0] * f, base[1] * f, base[2] * f), F, bb);
    }
  }
  return bb;
}

// a dark pixel outline around the silhouette, so the gun reads against any background
function outline(bb) {
  const W = vmW(), H = vmH(), ol = pk(8, 8, 10);
  for (let y = Math.max(0, bb[2] - 1); y <= Math.min(H - 1, bb[3] + 1); y++)
    for (let x = Math.max(0, bb[0] - 1); x <= Math.min(W - 1, bb[1] + 1); x++) {
      const i = y * W + x;
      if (zb[i] > 0) continue;
      if ((x > 0 && zb[i - 1] > 0) || (x < W - 1 && zb[i + 1] > 0) || (y > 0 && zb[i - W] > 0) || (y < H - 1 && zb[i + W] > 0)) pix[i] = ol;
    }
}

export function drawViewmodel(now) {
  fitBuffer();
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const quickBlade = now < S.quickUntil;
  const w = S.clawsOnly ? 'claws' : quickBlade ? 'blade' : S.weapon;
  const melee = w === 'blade' || w === 'claws';
  const canAds = !melee && ADS_Z[w] && S.scoped;
  ads += ((canAds ? 1 : 0) - ads) * Math.min(1, dt * 14);
  if (!ADS_Z[w] || melee) ads = 0;

  const hip = HIP[w] || HIP.blade, a = ads, loose = 1 - 0.8 * a;
  const moving = S.onGround ? Math.min(S.speed, 4) : 0;
  const bx = Math.sin(S.bobPhase) * moving * 0.004 * loose, by = -Math.abs(Math.cos(S.bobPhase)) * moving * 0.003 * loose;
  const r = !melee && S.reloading, reload = r ? Math.sin(Math.min(1, (now - r.start) / (r.until - r.start)) * Math.PI) : 0;
  const drawIn = Math.max(0, (S.switchUntil - now) / 350);
  const dip = Math.max(reload, drawIn);
  const kick = S.recoil * (w === 'sniper' || w === 'shotgun' ? 1 : 0.5);
  const swing = meleePose(now);

  const yaw = hip[3] * (1 - a) + S.swayX * 0.012 * loose + swing.yaw;
  const pitch = kick * (0.1 + 0.05 * a) - dip * 0.7 - S.swayY * 0.012 * loose + (melee ? 0.15 : 0) + swing.pitch;
  const roll = hip[4] * (1 - a) + dip * 0.5 * (reload ? 1 : 0) + (melee ? -0.35 : 0) + (S.slideDip || 0) * 0.3 + swing.roll;
  const t = {
    x: hip[0] * (1 - a) + bx + swing.x, y: hip[1] * (1 - a) + by - dip * 0.12 - (S.slideDip || 0) * 0.02 + swing.y,
    z: hip[2] + ((ADS_Z[w] || hip[2]) - hip[2]) * a - kick * 0.04 + swing.z,
    cr: Math.cos(roll), sr: Math.sin(roll), cp: Math.cos(pitch), sp: Math.sin(pitch), cy: Math.cos(yaw), sy: Math.sin(yaw),
  };
  const F = (vmW() / 2) / Math.tan(VM_FOV / 2);

  // accents glow in the gun's own color (same as its pickup), so you can tell what you're holding
  const m = METAL[S.theme.id] || METAL.hell, accent = GUN_COLOR[w] || S.theme.accent.split(',').map(Number), pulse = 0.8 + 0.2 * Math.sin(now / 250);
  const pal = { d: hex(m[0]), m: hex(m[1]), l: hex(m[2]), b: [22, 22, 26], w: [92, 60, 38], s: w === 'claws' ? [220, 230, 240] : [170, 176, 186],
    g: accent.map(c => c * pulse), x: [110, 200, 255] };
  const bp = now - S.fireT - 450;
  const offs = {
    slide: -Math.max(0, 1 - (now - S.fireT) / 90) * 0.03,
    pump: -Math.max(0, 1 - Math.abs(now - S.fireT - 450) / 200) * 0.06,
    bolt: w === 'sniper' && bp > 0 && bp < 400 ? -Math.sin(bp / 400 * Math.PI) * 0.05 : 0,
  };

  pix.fill(0); zb.fill(0);
  const model = MODELS[w];
  if (!model) return;
  const bb = drawModel(model, t, F, pal, offs);
  if (bb[0] > bb[1]) return;
  outline(bb);
  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, view.W, view.H);

  if (swing.trail > 0.05) drawSlashTrail(swing, w === 'claws');

  if (S.muzzle > 0 && !melee) {
    const [x, y, z] = xf(MUZZLE[w], t), sc = view.W / vmW();
    const px = (vmW() / 2 + x / z * F) * sc, py = (vmH() / 2 - y / z * F) * sc, u = Math.min(view.W, view.H * 1.6) / 100;
    const rad = (w === 'sniper' || w === 'shotgun' || w === 'beam' ? 11 : 6) * u * S.muzzle / 6, g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,230,160,0.95)'); g.addColorStop(0.35, 'rgba(255,170,60,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}

// wind-up → slash → recover; returns pose offsets + trail strength
const SWING_MS = 340;
function meleePose(now) {
  const sp = Math.min(1, (now - S.swingT) / SWING_MS);
  if (sp >= 1 || sp <= 0) return { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0, trail: 0 };
  if (sp < 0.2) {
    const e = (sp / 0.2) ** 2;
    return { yaw: 0.45 * e, pitch: -0.3 * e, roll: -0.55 * e, x: 0.05 * e, y: 0.03 * e, z: -0.05 * e, trail: 0 };
  }
  if (sp < 0.52) {
    const t = (sp - 0.2) / 0.32, e = t * t * (3 - 2 * t);
    return {
      yaw: 0.45 - 1.55 * e, pitch: -0.3 + 0.7 * e, roll: -0.55 + 1.85 * e,
      x: 0.05 - 0.26 * e, y: 0.03 - 0.08 * e, z: -0.05 + 0.2 * e,
      trail: Math.sin(t * Math.PI),
    };
  }
  const t = (sp - 0.52) / 0.48, e = 1 - (1 - t) ** 2;
  return {
    yaw: -1.1 * (1 - e), pitch: 0.4 * (1 - e), roll: 1.3 * (1 - e),
    x: -0.21 * (1 - e), y: -0.05 * (1 - e), z: 0.15 * (1 - e),
    trail: (1 - e) * 0.35,
  };
}

// bright arc that follows the slash so the attack reads clearly
function drawSlashTrail(swing, claws) {
  const cx = view.W * 0.62, cy = view.H * 0.55, r = Math.min(view.W, view.H) * 0.38;
  const a0 = -0.9 + swing.yaw * 0.35, a1 = a0 + 1.1 * swing.trail;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = claws ? `rgba(140,255,80,${0.55 * swing.trail})` : `rgba(220,240,255,${0.5 * swing.trail})`;
  ctx.lineWidth = claws ? 7 : 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = claws ? `rgba(200,255,120,${0.85 * swing.trail})` : `rgba(255,255,255,${0.75 * swing.trail})`;
  ctx.lineWidth = claws ? 2.5 : 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, a0 + 0.05, a1 - 0.02);
  ctx.stroke();
  ctx.restore();
}
