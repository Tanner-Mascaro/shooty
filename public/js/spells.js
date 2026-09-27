// Casting: hold the wall / ramp key to see where it'll go, let go to conjure it; the spell keys
// cast what's stored in those slots. The server checks mana and room and has the final say.
import { BUILDS } from '/shared/config.js';
import { aimBuild, canBuild } from '/shared/spells.js';
import { S } from './state.js';
import { send } from './net.js';
import { play } from './audio.js';
import { toast } from './ui.js';

const canCast = () => S.started && S.me && !S.dead && !S.clawsOnly;

// where the build being aimed would land, and whether it can: { kind, x, y, dir, ok }
export function buildPlan() {
  const kind = S.buildAim;
  if (!kind || !canCast()) return null;
  const at = aimBuild(kind, S.me.x, S.me.y, S.me.a);
  return { kind, ...at, ok: canBuild(S.T, kind, at.x, at.y, at.dir) && S.mana >= BUILDS[kind].mana };
}

export function aimBuildSpell(kind) { if (canCast()) S.buildAim = kind; }

export function releaseBuildSpell(kind) {
  if (S.buildAim !== kind) return;
  const plan = buildPlan();
  S.buildAim = null;
  if (!plan) return;
  if (S.mana < BUILDS[kind].mana) { play('dry'); toast('Not enough mana'); return; }
  if (!plan.ok) { play('dry'); return; }
  send({ type: 'cast', build: kind, x: plan.x, y: plan.y, dir: plan.dir });
}

export function castSlot(slot) {
  if (!canCast() || !S.spells[slot]) return;
  send({ type: 'cast', slot });
}
