// Camera sync + cheap HUD projection / occlusion (heightmap only — no mesh raycasts).
import { S } from '../../state.js';
import { view } from '../canvas.js';
import { getCamera } from './scene.js';
import * as THREE from 'three';
import { kindAt, groundAt } from '/shared/terrain.js';

const _target = new THREE.Vector3();

export function syncCamera() {
  const cam = getCamera();
  if (!cam || !S.me || !S.cam) return;
  const me = S.me, c = S.cam;
  const pitch = S.pitch + S.punch;
  const shakeX = (c.ox || 0) * 0.002;
  const shakeY = (c.oy || 0) * 0.002;
  const ex = me.x + shakeX, ey = c.eye + shakeY, ez = me.y;
  // Match soft-renderer convention: +pitch looks up, a=0 faces +X (game → Three: y-up).
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  cam.position.set(ex, ey, ez);
  cam.up.set(0, 1, 0);
  cam.lookAt(ex + Math.cos(me.a) * cp, ey + sp, ez + Math.sin(me.a) * cp);
  cam.fov = (S.fov * 180 / Math.PI) * (1 + (S.fovKick || 0) * 0.5);
  cam.aspect = view.W / Math.max(1, view.H);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

export function project(x, y, z) {
  const cam = getCamera();
  if (!cam || !S.me) return { f: -1, x: 0, y: 0 };
  const c = S.cam;
  const dx = x - S.me.x, dy = y - S.me.y;
  const f = dx * c.fwdx + dy * c.fwdy;
  _target.set(x, z, y);
  _target.project(cam);
  return {
    f,
    x: (_target.x * 0.5 + 0.5) * view.W + (c.ox || 0),
    y: (-_target.y * 0.5 + 0.5) * view.H + (c.oy || 0),
  };
}

// Cheap LOS: step along the view ray; walls/props taller than eye hide HUD glows and names.
export function occluded(p) {
  if (p.f < 0.15) return true;
  if (p.x < -40 || p.y < -40 || p.x > view.W + 40 || p.y > view.H + 40) return true;
  if (!S.me || !S.T || !S.cam) return false;
  const steps = Math.min(16, 3 + (p.f | 0));
  const eye = S.cam.eye;
  for (let i = 1; i < steps; i++) {
    const t = (i / steps) * 0.92;
    const x = S.me.x + S.cam.fwdx * p.f * t;
    const y = S.me.y + S.cam.fwdy * p.f * t;
    if (kindAt(S.T, x, y) === 1 && groundAt(S.T, x, y) > eye - 0.2) return true;
  }
  return false;
}
