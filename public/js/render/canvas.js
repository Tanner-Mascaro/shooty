// Visible HUD canvas (#c) sits on top of a WebGL canvas (no per-frame blit).
export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d', { alpha: true });
export const glCanvas = document.createElement('canvas');
glCanvas.id = 'gl';
glCanvas.style.cssText = 'display:block;position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none';
if (canvas.parentNode) canvas.parentNode.insertBefore(glCanvas, canvas);
canvas.style.zIndex = '1';
canvas.style.background = 'transparent';

// W/H: screen size. RW/RH aliases for HUD/viewmodel. GL_SCALE < 1 renders cheaper.
export const GL_SCALE = 0.75;
export const view = { W: 0, H: 0, RW: 0, RH: 0, sc: 1, gW: 0, gH: 0 };

export function resize() {
  const v = view;
  v.W = canvas.width = window.innerWidth;
  v.H = canvas.height = window.innerHeight;
  v.RW = v.W;
  v.RH = v.H;
  v.sc = 1;
  v.gW = Math.max(1, Math.round(v.W * GL_SCALE));
  v.gH = Math.max(1, Math.round(v.H * GL_SCALE));
  glCanvas.width = v.gW;
  glCanvas.height = v.gH;
}

export function ensureCanvas() {
  if (!view.W) resize();
}

window.addEventListener('resize', () => { if (view.W) resize(); });

// Clear the transparent HUD layer; world is already on the WebGL canvas underneath.
export function present(ox = 0, oy = 0) {
  ensureCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.W, view.H);
  glCanvas.style.transform = (ox || oy) ? `translate(${ox}px,${oy}px)` : '';
}

export function pk(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}
