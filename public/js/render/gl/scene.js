// Three.js scene, lights, fog — kept cheap (no shadows, low pixel ratio).
import * as THREE from 'three';
import { glCanvas, view, ensureCanvas } from '../canvas.js';
import { buildWorld, clearWorld } from './terrainMesh.js';
import { MAX_DEPTH } from '/shared/config.js';

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.55);
  scene.add(hemi);
  dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.castShadow = false;
  scene.add(dir);
  scene.add(dir.target);

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
  scene.fog = new THREE.Fog(fogCol, far * 0.3, far);
  scene.background = new THREE.Color(theme.skyHi[0] / 255, theme.skyHi[1] / 255, theme.skyHi[2] / 255);

  hemi.color.setRGB(theme.skyLo[0] / 255, theme.skyLo[1] / 255, theme.skyLo[2] / 255);
  hemi.groundColor.setRGB(theme.fog[0] / 400, theme.fog[1] / 400, theme.fog[2] / 400);
  hemi.intensity = theme.ceiling ? 0.5 : 0.75;

  const orbCol = new THREE.Color(theme.orb[0] / 255, theme.orb[1] / 255, theme.orb[2] / 255);
  dir.color.copy(orbCol);
  dir.intensity = theme.ceiling ? 0.4 : (theme.mat?.sun ?? 1.0);
  const ox = Math.cos(theme.orbA) * 35, oz = Math.sin(theme.orbA) * 35;
  dir.position.set(30 + ox * 0.3, 28 + theme.orbE * 40, 30 + oz * 0.3);
  dir.target.position.set(30, 0, 30);

  orbMesh.visible = !theme.ceiling && theme.orbR > 0;
  if (orbMesh.visible) {
    orbMesh.material.color.copy(orbCol);
    orbMesh.scale.setScalar(Math.max(2, theme.orbR * 80));
    orbMesh.position.set(30 + ox, 20 + theme.orbE * 50, 30 + oz);
  }
}

export function invalidateWorld() {
  if (scene) clearWorld(scene);
  currentLevel = null;
}

export function setLevelWorld(name, T, theme) {
  initGL();
  if (currentLevel === name && worldBuilt()) {
    applyTheme(theme);
    return;
  }
  currentLevel = name;
  applyTheme(theme);
  buildWorld(scene, T, theme);
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
