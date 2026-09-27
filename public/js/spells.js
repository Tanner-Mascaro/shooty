// Casting. Build mode (its key toggles it; a weapon key, the wheel or right-click puts the gun
// back) holsters your gun and shows where a ramp would go; click to conjure one. Stand on a ramp
// facing the same way to stack the next one on top. The spell keys cast what's stored in those
// slots. The server checks mana and room and has the final say.
import { BUILDS, rampLevels } from '/shared/config.js';
import { aimBuild, canBuild, fitsLevels } from '/shared/spells.js';
import { S } from './state.js';
import { send } from './net.js';
import { play } from './audio.js';
import { toast } from './ui.js';

const canCast = () => S.started && S.me && !S.dead && !S.clawsOnly;

// where the ramp would land and whether it can: { kind, x, y, dir, base, ok }
export function buildPlan() {
  if (!S.buildMode || !canCast()) return null;
  const at = aimBuild('ramp', S.me.x, S.me.y, S.me.a, [...S.builds.values()]);
  const ok = fitsLevels(at.base, rampLevels(S.level)) && canBuild(S.T, 'ramp', at.x, at.y, at.dir) && S.mana >= BUILDS.ramp.mana;
  return { kind: 'ramp', ...at, ok };
}

export function setBuildMode(on) {
  on = !!on && canCast();
  if (on === S.buildMode) return;
  S.buildMode = on;
  S.scoped = false; S.reloading = null; S.mouseHeld = false;
  play('swap');
}

export function placeRamp() {
  const plan = buildPlan();
  if (!plan) return;
  if (S.mana < BUILDS.ramp.mana) { play('dry'); toast('Not enough mana'); return; }
  if (!plan.ok) { play('dry'); return; }
  send({ type: 'cast', build: 'ramp', x: plan.x, y: plan.y, dir: plan.dir });
}

export function castSlot(slot) {
  if (!canCast() || !S.spells[slot]) return;
  send({ type: 'cast', slot });
}
