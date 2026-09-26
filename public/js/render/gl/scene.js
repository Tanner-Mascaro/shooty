// Three.js scene, lights, fog — kept cheap (no shadows, low pixel ratio).
import * as THREE from 'three';
import { glCanvas, view, ensureCanvas } from '../canvas.js';
import { buildWorld, clearWorld } from './terrainMesh.js';
import { MAX_DEPTH } from '/shared/config.js';
import { MW, MH } from '/shared/levels.js';

let renderer = null, scene = null, camera = null;
let hemi = null, dir = null, orbMesh = null;
let currentLevel = null;

export function getRenderer() { return renderer; }
export function getScene() { return scene; }
export function getCamera() { return camera; }

export function initGL() {
  if (renderer) return;
  ensureCanvas();
  renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(view.gW || view.W, view.gH || view.H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.autoClear = true;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, view.W / Math.max(1, view.H), 0.08, MAX_DEPTH + 10);

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 1.25);
  scene.add(hemi);
  dir = new THREE.DirectionalLight(0xffffff, 1.35);
  dir.castShadow = false;
  scene.add(dir);
  scene.add(dir.target);
  // soft fill from the opposite side so walls don't silhouette to black
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.45);
  fill.position.set(-20, 18, -15);
  scene.add(fill);
  scene.add(fill.target);
  fill.target.position.set(MW / 2, 0, MH / 2);

  orbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  scene.add(orbMesh);

  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer || !view.W) return;
  renderer.setSize(view.gW || view.W, view.gH || view.H, false);
  camera.aspect = view.W / Math.max(1, view.H);
  camera.updateProjectionMatrix();
}

export function applyTheme(theme) {
  if (!scene) return;
  const fogCol = new THREE.Color(theme.fog[0] / 255, theme.fog[1] / 255, theme.fog[2] / 255);
  const far = Math.min(MAX_DEPTH, 10 / Math.max(0.025, theme.fogK));
  scene.fog = new THREE.Fog(fogCol, far * 0.35, far);
  scene.background = new THREE.Color(theme.skyHi[0] / 255, theme.skyHi[1] / 255, theme.skyHi[2] / 255);

  hemi.color.setRGB(theme.skyLo[0] / 255, theme.skyLo[1] / 255, theme.skyLo[2] / 255);
  hemi.groundColor.setRGB(theme.fog[0] / 280, theme.fog[1] / 280, theme.fog[2] / 280);
  hemi.intensity = theme.ceiling ? 0.85 : 1.35;
  // cool moon fill + warm torch sun so gothic halls stay readable
  const orbCol = new THREE.Color(theme.orb[0] / 255, theme.orb[1] / 255, theme.orb[2] / 255);
  const sun = theme.mat?.sun ?? 1.0;
  dir.color.copy(theme.ceiling ? orbCol : new THREE.Color(1, 0.96, 0.9).lerp(orbCol, 0.22));
  dir.intensity = theme.ceiling ? 0.85 : Math.max(1.15, sun);
  const cx = MW / 2, cy = MH / 2;
  const ox = Math.cos(theme.orbA) * 40, oz = Math.sin(theme.orbA) * 40;
  dir.position.set(cx + ox * 0.35, 32 + theme.orbE * 40, cy + oz * 0.35);
  dir.target.position.set(cx, 0, cy);

  orbMesh.visible = !theme.ceiling && theme.orbR > 0;
  if (orbMesh.visible) {
    orbMesh.material.color.copy(orbCol);
    orbMesh.scale.setScalar(Math.max(2.5, theme.orbR * 90));
    orbMesh.position.set(cx + ox, 22 + theme.orbE * 50, cy + oz);
  }
}

export function invalidateWorld() {
  if (scene) clearWorld(scene);
  currentLevel = null;
}

export function setLevelWorld(name, T, theme, palette) {
  initGL();
  if (currentLevel === name && worldBuilt()) {
    applyTheme(theme);
    return;
  }
  currentLevel = name;
  applyTheme(theme);
  buildWorld(scene, T, theme, palette);
}

// build the mesh before the match UI flips, so the first in-game frame isn't a hitch
export function prewarmWorld(name, T, theme, palette) {
  if (!name || !T || !theme) return;
  ensureCanvas();
  setLevelWorld(name, T, theme, palette);
}

function worldBuilt() {
  return scene && scene.getObjectByName('terrain');
}

export function renderGL() {
  if (!renderer) return;
  if (view.gW !== glCanvas.width || view.gH !== glCanvas.height) onResize();
  renderer.render(scene, camera);
}

export function disposeGL() {
  if (!renderer) return;
  clearWorld(scene);
  renderer.dispose();
  renderer = scene = camera = null;
  currentLevel = null;
}
