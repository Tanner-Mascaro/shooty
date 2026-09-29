// The tutorial: a practice room with straw dummies (server: Room.makeTutorial) and a checklist that
// ticks off as you try each thing. Finishing tells the server, which pays a one-time XP reward.
import { S } from './state.js';
import { send } from './net.js';
import { settings, keyName } from './settings.js';
import { MAX_SPEED } from './constants.js';
import { goToRoom, newCode } from './room.js';

const $ = id => document.getElementById(id);
const k = action => keyName(settings.keys[action]);
// how to do each thing, for keyboard, controller and touch
const how = (keys, pad, touch) => S.touch ? touch : S.padMove && navigator.getGamepads && [...navigator.getGamepads()].some(Boolean) ? pad : keys;

const STEPS = [
  { id: 'move', text: () => 'Walk around — ' + how(`${k('forward')}${k('left')}${k('back')}${k('right')}`, 'left stick', 'left thumb joystick') },
  { id: 'look', text: () => 'Look around — ' + how('move the mouse (click the game first)', 'right stick', 'drag on the right side') },
  { id: 'jump', text: () => 'Jump — ' + how(k('jump'), 'A / ✕', 'JUMP') },
  { id: 'bhop', text: () => 'Bunny hop — hold jump and turn as you land to build speed' },
  { id: 'slide', text: () => 'Slide — ' + how(`hold ${k('slide')} while running`, 'B / ○ while running', 'not on touch — skip it') },
  { id: 'pickup', text: () => 'Pick something up — walk over a gun, ammo or a potion' },
  { id: 'reload', text: () => 'Reload — ' + how(k('reload'), 'X / □', 'RELOAD') },
  { id: 'potion', text: () => 'Throw a potion — ' + how(k('nade'), 'LB', 'tap the potion on the hotbar') },
  { id: 'spell', text: () => 'Drink the potion on your hotbar — ' + how(k('spell1'), 'd-pad up', 'tap it on the hotbar') },
  { id: 'kill', text: () => 'Take down a straw dummy' },
];

let done = new Set(), start = null, lastA = null, turned = 0, finished = false, timer = 0;

function render() {
  $('tutorialSteps').replaceChildren(...STEPS.map(s => {
    const li = document.createElement('li');
    li.classList.toggle('done', done.has(s.id));
    li.textContent = s.text();
    return li;
  }));
  $('tutorialCount').textContent = `${done.size} / ${STEPS.length}`;
  $('tutorialDone').hidden = !finished;
}

function check() {
  if (!S.tutorial || !S.started || !S.me) return;
  const me = S.me, before = done.size;
  start ??= { x: me.x, y: me.y };
  if (lastA !== null) turned += Math.abs(Math.atan2(Math.sin(me.a - lastA), Math.cos(me.a - lastA)));
  lastA = me.a;
  if (Math.hypot(me.x - start.x, me.y - start.y) > 4) done.add('move');
  if (turned > 3) done.add('look');
  if (!S.onGround && !S.dead) done.add('jump');
  if (S.speed > MAX_SPEED * 1.2) done.add('bhop');
  if (S.sliding || S.touch) done.add('slide'); // no slide button on touch screens
  if (S.pickedUp) done.add('pickup');
  if (S.reloading) done.add('reload');
  if (S.threwPotion) done.add('potion');
  if (S.castSpell) done.add('spell');
  if (S.myKills > 0) done.add('kill');
  if (done.size !== before) {
    if (done.size === STEPS.length && !finished) { finished = true; send({ type: 'tutorialDone' }); }
    render();
  }
}

export function initTutorial() {
  $('tutorialLeave').addEventListener('click', () => goToRoom(newCode()));
  $('tutorialBack').addEventListener('click', () => goToRoom(newCode()));
}

// called when a room's first message arrives: in the practice room, ready up straight away
export function tutorialRoom(inTutorial) {
  S.tutorial = inTutorial;
  $('tutorial').hidden = !inTutorial;
  clearInterval(timer);
  if (!inTutorial) return;
  done = new Set(); start = null; lastA = null; turned = 0; finished = false;
  S.pickedUp = false; S.threwPotion = false; S.castSpell = false;
  render();
  timer = setInterval(check, 120);
  setTimeout(() => send({ type: 'ready' }), 300);
}
