// Battle royale storm: a glowing wall at the edge of the safe circle and a ring on the ground
// where the next circle will be.
import * as THREE from 'three';
import { S } from '../../state.js';
import { getScene } from './scene.js';

const WALL_H = 30;
let wall = null, ring = null;

export function drawZone(now) {
  const scene = getScene();
  if (!scene) return;
  if (!wall) {
    wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa048d0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xf5e6b0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    wall.renderOrder = ring.renderOrder = 3;
  }
  if (wall.parent !== scene) scene.add(wall, ring); // the scene is rebuilt after a GL reset
  const z = S.started && S.zone;
  wall.visible = !!z && z.r > 0.05;
  ring.visible = !!z && z.nr > 0.05 && (z.nx !== z.x || z.ny !== z.y || z.nr !== z.r);
  if (!z) return;
  wall.scale.set(Math.max(0.05, z.r), WALL_H, Math.max(0.05, z.r));
  wall.position.set(z.x, WALL_H / 2 - 3, z.y);
  wall.material.opacity = (z.shrinking ? 0.32 : 0.22) + 0.06 * Math.sin(now / 280);
  ring.scale.set(Math.max(0.05, z.nr), Math.max(0.05, z.nr), 1);
  ring.position.set(z.nx, 0.08, z.ny);
}
