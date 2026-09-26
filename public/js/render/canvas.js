// The screen canvas plus a low-res pixel buffer the 3D world is rendered into, then scaled up.
export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');
export const off = document.createElement('canvas');
const octx = off.getContext('2d');

// W/H: screen size. RW/RH: buffer size. pix: buffer pixels (ABGR). zbuf: depth per buffer pixel.
export const view = { W: 0, H: 0, RW: 0, RH: 0, img: null, pix: null, zbuf: null, skyRow: null };

export function resize() {
  const v = view;
  v.W = canvas.width = window.innerWidth; v.H = canvas.height = window.innerHeight;
  v.RW = Math.min(480, Math.round(v.W / 2)); v.RH = Math.max(1, Math.round(v.RW * v.H / v.W));
  off.width = v.RW; off.height = v.RH;
  v.img = octx.createImageData(v.RW, v.RH);
  v.pix = new Uint32Array(v.img.data.buffer);
  v.zbuf = new Float32Array(v.RW * v.RH);
  v.skyRow = new Uint32Array(v.RH);
}
resize();
window.addEventListener('resize', resize);

export function present(ox, oy) {
  octx.putImageData(view.img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, view.W, view.H);
  ctx.drawImage(off, ox, oy, view.W, view.H);
}

// pack an rgb color (clamped) into a buffer pixel
export function pk(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}
