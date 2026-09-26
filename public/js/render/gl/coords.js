// Game coords: X/Y horizontal, Z up. Three.js: X/Y-up/Z with three.z = game.y.
export function toThree(x, y, z, out) {
  if (out) { out.set(x, z, y); return out; }
  return { x, y: z, z: y };
}

export function setThreePos(obj, x, y, z) {
  obj.position.set(x, z, y);
}
