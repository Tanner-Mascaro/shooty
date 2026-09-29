// Things on the map that come and go, as their own meshes (the terrain mesh is built once per
// map): the Crypt's doors (shared/crypt.js; they vanish when bought), jump pads (a glowing rune
// disc) and portals (a spinning violet ring over a disc, both ends of a pair).
import * as THREE from 'three';
import { S } from '../../state.js';
import { getScene } from './scene.js';
import { cryptLayout } from '/shared/crypt.js';
import { CEILING_H, walkHeight } from '/shared/terrain.js';
import { JUMP_PAD, PORTAL } from '/shared/config.js';

const group = new THREE.Group();
group.name = 'props';
let attached = false, doorKey = '', padKey = '', mats = null;
const doorMeshes = new Map(); // door id -> mesh
const pads = [], portals = [];

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeMats() {
  // heavy barred planks with iron bands and a glowing lock rune
  const planks = canvasTexture(64, (g, n) => {
    for (let x = 0; x < n; x += 8) {
      const v = 0.75 + 0.25 * Math.sin(x * 1.7);
      g.fillStyle = `rgb(${92 * v | 0},${62 * v | 0},${36 * v | 0})`; g.fillRect(x, 0, 8, n);
      g.fillStyle = 'rgba(30,18,10,0.8)'; g.fillRect(x, 0, 1, n);
    }
    g.fillStyle = '#2a2428'; g.fillRect(0, 10, n, 6); g.fillRect(0, n - 16, n, 6);
    g.fillStyle = '#8a8490'; for (let x = 4; x < n; x += 12) { g.fillRect(x, 12, 2, 2); g.fillRect(x, n - 14, 2, 2); }
  });
  planks.repeat.set(1, 1);
  const rune = canvasTexture(64, (g, n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#ffb040'; g.lineWidth = 3;
    g.beginPath(); g.arc(n / 2, n / 2, n / 5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(n / 2, n / 2 - n / 4); g.lineTo(n / 2, n / 2 + n / 4); g.moveTo(n / 2 - n / 6, n / 2); g.lineTo(n / 2 + n / 6, n / 2); g.stroke();
  });
  const disc = (col) => canvasTexture(64, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n / 2);
    grad.addColorStop(0, col + 'ff'); grad.addColorStop(0.55, col + '88'); grad.addColorStop(0.8, col + 'ee'); grad.addColorStop(1, col + '00');
    g.fillStyle = grad; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(n / 2, n / 2, n * (0.18 + i * 0.1), 0, Math.PI * 2); g.stroke(); }
  });
  return {
    door: new THREE.MeshLambertMaterial({ map: planks, emissive: 0xffffff, emissiveMap: rune, emissiveIntensity: 0.9 }),
    pad: new THREE.MeshBasicMaterial({ map: disc('#50d0ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    portal: new THREE.MeshBasicMaterial({ map: disc('#a060ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    ring: new THREE.MeshBasicMaterial({ color: 0xb080ff, transparent: true, opacity: 0.85 }),
  };
}

function clear(list) {
  for (const m of list) { group.remove(m); m.geometry.dispose(); }
  list.length = 0;
}

function syncDoors() {
  const closed = S.level === 'crypt' && S.survival && S.MAP ? cryptLayout(S.MAP).doors.filter(d => !S.openDoors.has(d.id)) : [];
  const key = S.level + '|' + closed.map(d => d.id).join(',');
  if (key === doorKey) return;
  doorKey = key;
  for (const [id, m] of doorMeshes) if (!closed.some(d => d.id === id)) { group.remove(m); m.geometry.dispose(); doorMeshes.delete(id); }
  for (const d of closed) {
    if (doorMeshes.has(d.id)) continue;
    const w = d.x1 - d.x0, h = d.y1 - d.y0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, CEILING_H, h), mats.door);
    m.position.set(d.x0 + w / 2, CEILING_H / 2, d.y0 + h / 2);
    group.add(m);
    doorMeshes.set(d.id, m);
  }
}

function syncTraversal() {
  const key = S.level + '|' + S.pads.map(p => p.x + ',' + p.y).join(';') + '|' + S.portals.map(p => p.a.x + ',' + p.b.x).join(';');
  if (key === padKey) return;
  padKey = key;
  clear(pads); clear(portals);
  for (const p of S.pads) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(JUMP_PAD.r * 1.4, 24), mats.pad);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, (p.z || walkHeight(S.T, p.x, p.y, 0)) + 0.04, p.y);
    group.add(m); pads.push(m);
  }
  for (const pt of S.portals) for (const end of [pt.a, pt.b]) {
    const z = end.z || 0;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(PORTAL.r * 1.5, 24), mats.portal);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(end.x, z + 0.05, end.y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 28), mats.ring);
    ring.position.set(end.x, z + 0.8, end.y);
    group.add(disc, ring); portals.push(disc, ring);
  }
}

export function drawProps(now) {
  const scene = getScene();
  if (!scene) return;
  if (!attached) { scene.add(group); attached = true; }
  mats ||= makeMats();
  syncDoors();
  syncTraversal();
  const pulse = 0.75 + 0.25 * Math.sin(now / 260);
  mats.pad.opacity = pulse; mats.portal.opacity = 0.6 + 0.4 * Math.sin(now / 180);
  for (const m of pads) m.rotation.z = now / 900;
  portals.forEach((m, i) => { if (m.geometry.type === 'TorusGeometry') { m.rotation.y = now / 400 + i; m.rotation.x = Math.sin(now / 700 + i) * 0.3; } else m.rotation.z = -now / 600; });
}
