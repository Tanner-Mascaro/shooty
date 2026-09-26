import test from 'node:test';
import assert from 'node:assert/strict';
import { tryJump } from '../shared/movement.js';
import { MOVE_JUMP_V, PLAGUE_JUMPS } from '../shared/config.js';

const grounded = () => ({ onGround: true, jumpsUsed: 0, jumpHeld: false, vz: 0 });

test('infected get exactly one extra jump and must release the jump key first', () => {
  const s = grounded();
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), true);
  s.vz = -1;
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), false);
  assert.equal(s.vz, -1);
  tryJump(s, false, PLAGUE_JUMPS);
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), true);
  assert.equal(s.vz, MOVE_JUMP_V);
  assert.equal(s.jumpsUsed, 2);
  tryJump(s, false, PLAGUE_JUMPS);
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), false);
});

test('healthy players cannot air jump and holding jump still bunny hops on landing', () => {
  const s = grounded();
  assert.equal(tryJump(s, true), true);
  tryJump(s, false);
  assert.equal(tryJump(s, true), false);
  s.onGround = true;
  assert.equal(tryJump(s, true), true);
  assert.equal(s.jumpsUsed, 1);
});

test('stepping off a ledge leaves only one extra jump, and landing restores both', () => {
  const s = { ...grounded(), onGround: false };
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), true);
  assert.equal(s.jumpsUsed, 2);
  tryJump(s, false, PLAGUE_JUMPS);
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), false);
  s.onGround = true;
  tryJump(s, false, PLAGUE_JUMPS);
  assert.equal(s.jumpsUsed, 0);
  assert.equal(tryJump(s, true, PLAGUE_JUMPS), true);
});
