import { MOVE_JUMP_V, PLAGUE_DASH_DURATION, PLAGUE_DASH_COOLDOWN } from './config.js';

// Holding jump keeps ground hopping; an extra air jump needs a fresh press.
// Walking off a ledge spends the ground jump, leaving only the extra air jump.
export function tryJump(state, held, maxJumps = 1) {
  const pressed = held && !state.jumpHeld;
  state.jumpHeld = held;
  if (state.onGround) state.jumpsUsed = 0;
  const used = state.onGround ? 0 : Math.max(1, state.jumpsUsed || 0);
  if (!held || (!state.onGround && (!pressed || used >= maxJumps))) return false;
  state.jumpsUsed = used + 1;
  state.vz = MOVE_JUMP_V;
  state.onGround = false;
  return true;
}

// Shared by local movement and the server, including infected bots.
export function tryDash(state, dx, dy, now) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0 || now < (state.nextDash || 0)) return false;
  state.dashX = dx / length; state.dashY = dy / length;
  state.dashUntil = now + PLAGUE_DASH_DURATION;
  state.nextDash = now + PLAGUE_DASH_COOLDOWN;
  return true;
}
