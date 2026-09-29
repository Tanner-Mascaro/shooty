// The Wiki: everything about the game in one popup, built from the game's own data (shared/config.js,
// shared/progression.js, shared/levels.js), so it stays right as things change.
import { WEAPONS, GUN_NAMES, gunName, PAD_GUNS, SURVIVAL, MODE_NAMES, POWERUPS, MAP_EVENTS, EVENT_EVERY, EVENT_FIRST, STORED_SPELLS,
  HASTE, WARD, BROOM, BLINK, INVIS, CURSE, FROST, TOTEM, WELL, DECOY, HEAL_SPELL, WAND_CHAIN, NADE, ATTACHMENTS, MOBS, MOB_SETS, DROPS, ELIXIRS,
  WALL_BUYS, DOORS, METEOR, POWERUP_SHIELD, SUPPLIES } from '/shared/config.js';
import { SKIN_UNLOCKS, HATS, FAMILIARS, TITLES, KILL_EFFECTS, CAMOS, FEATS, featReward, hatNeeds, petNeeds } from '/shared/progression.js';
import { LEVEL_NAMES, FEATURED_LEVELS, SURVIVAL_LEVELS, MAP_UNLOCKS } from '/shared/levels.js';
import { SPELL_NAME } from './constants.js';
import { PLAYER_SKIN_NAMES } from './render/sprites.js';
import { gunArt } from './render/gunArt.js';
import { modeHelpText } from './room.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const s = ms => (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + 's';
function table(head, rows) {
  const t = el('table', 'wikiTable'), tr = el('tr');
  head.forEach(h => tr.append(el('th', null, h)));
  t.append(tr);
  for (const r of rows) { const row = el('tr'); r.forEach(c => { const td = el('td'); c instanceof Node ? td.append(c) : td.textContent = c; row.append(td); }); t.append(row); }
  return t;
}
const entry = (title, text) => { const d = el('div', 'wikiEntry'); d.append(el('b', null, title), el('p', null, text)); return d; };
const note = text => el('p', 'wikiNote', text);

// --- the sections ---
function guns() {
  const kind = w => w.melee ? 'Melee' : w.pellets && w.falloff ? 'Shotgun' : w.pellets ? 'Burst' : w.auto ? 'Automatic' : w.scopedSpread === 0 ? 'Sniper' : 'Semi-auto';
  const pic = w => { const a = gunArt(w); if (!a) return ''; const c = el('canvas', 'wikiGun'); c.width = a.canvas.width; c.height = a.canvas.height; c.getContext('2d').drawImage(a.canvas, 0, 0); return c; };
  const list = [...PAD_GUNS.filter(w => !['rifle', 'sniper', 'shotgun', 'smg', 'deagle', 'burst', 'lmg', 'revolver', 'carbine', 'uzi', 'beam', 'wand'].includes(w))];
  const order = ['pistol', 'deagle', 'revolver', 'rifle', 'burst', 'carbine', 'smg', 'uzi', 'lmg', 'shotgun', 'sniper', 'beam', 'wand', ...list, 'blade'];
  const rows = order.filter(w => WEAPONS[w]).map(w => {
    const d = WEAPONS[w], name = el('span', 'wikiGunName');
    name.append(pic(w), el('b', null, gunName(w)));
    const dmg = d.pellets ? `${d.dmg} × ${d.pellets}` : d.melee ? `${d.dmg} (backstab ${d.backstab})` : String(d.dmg);
    return [name, kind(d), dmg, d.head ? '×' + d.head : '—', d.melee ? '—' : Math.round(60000 / d.cd) + '/min', d.mag || '—', d.reload ? s(d.reload) : '—'];
  });
  return [note('Everyone spawns with a pistol and a blade. Guns sit on the glowing pads and in crates around each realm; walk over a crate, or press the use key on a pad to swap. A gun you empty completely is gone. Aim down the sights for a tighter shot, and headshots hit harder.'),
    table(['Gun', 'Type', 'Damage', 'Headshot', 'Fire rate', 'Mag', 'Reload'], rows),
    entry('Hex Wand', `Its bolt jumps from whoever it hits to the nearest other enemy within ${WAND_CHAIN.range}m, for ${WAND_CHAIN.dmg} more damage.`),
    entry('Potions (grenades)', `Throw with the potion key: ${NADE.dmg} damage at the center of a ${NADE.radius}m blast, after a short fuse. Carry up to ${NADE.maxCarry}.`),
    entry('Blade', 'Quick-stab with the melee key from any gun. A stab from behind is a backstab, and kills outright.')];
}
function modes() {
  return Object.keys(MODE_NAMES).map(m => entry(MODE_NAMES[m], modeHelpText(m)));
}
function realms() {
  const blurb = l => document.querySelector(`#levels button[data-level="${l}"] small`)?.textContent || '';
  return [note('Vote for the next realm in the lobby. A realm with a level on it unlocks as you level up — and if anyone in the lobby has it, everyone can play it.'),
    table(['Realm', 'What it is', 'Unlocks'], FEATURED_LEVELS.map(l => [LEVEL_NAMES[l], blurb(l), MAP_UNLOCKS[l] ? 'Level ' + MAP_UNLOCKS[l] : 'Free'])),
    el('h4', null, 'Wave Survival maps'),
    table(['Map', 'What it is'], SURVIVAL_LEVELS.map(l => [LEVEL_NAMES[l], blurb(l)]))];
}
const SPELL_TEXT = {
  heal: `Heals ${HEAL_SPELL} health, up to your max.`,
  haste: `Run ${Math.round((HASTE.speed - 1) * 100)}% faster for ${s(HASTE.ms)}.`,
  ward: `A shield that soaks up ${WARD.absorb} damage for ${s(WARD.ms)}.`,
  broom: `A burst forward the way you're facing, faster than anyone can run.`,
  blink: `Step ${BLINK.dist}m straight ahead, short of walls and pits.`,
  invis: `Almost invisible for ${s(INVIS.ms)}, until you attack.`,
  curse: `Slows the enemy you're aiming at (within ${CURSE.range}m) to ${Math.round(CURSE.slow * 100)}% speed for ${s(CURSE.ms)}.`,
  frost: `Roots every enemy within ${FROST.radius}m in place for ${s(FROST.ms)}.`,
  totem: `A totem that heals you and your allies nearby, ${TOTEM.hps} health a second for ${s(TOTEM.ms)}.`,
  well: `A gravity well where you aim (up to ${WELL.range}m) that drags enemies toward its middle for ${s(WELL.ms)}.`,
  decoy: `A double of you that draws fire for ${s(DECOY.ms)} (${DECOY.hp} health).`,
};
function spells() {
  return [note('Spell potions come from the scroll crates around each realm. You carry a few on your hotbar; drink one with its number key.'),
    ...STORED_SPELLS.map(k => entry(SPELL_NAME[k] || k, SPELL_TEXT[k] || ''))];
}
function events() {
  return [el('h4', null, 'Power-ups'), note('Glowing pick-ups that appear around the realm; walk through one.'),
    ...Object.values(POWERUPS).map(p => entry(p.name, `${p.text}${p.name.includes('HAT') ? ` (${POWERUP_SHIELD} damage)` : ''} for ${s(p.ms)}.`)),
    el('h4', null, 'Map events'), note(`Every ${s(EVENT_EVERY)} or so (the first after ${s(EVENT_FIRST)}) something strange happens to the whole realm, for everyone.`),
    ...Object.values(MAP_EVENTS).map(e => entry(e.name, e.text + (e.name.includes('METEOR') ? ` — each meteor hits for ${METEOR.dmg} in a ${METEOR.radius}m circle, with a warning ring first.` : '') + ` Lasts ${s(e.ms)}.`)),
    el('h4', null, 'Jump pads and portals'), note('Step on a glowing blue pad to be flung up and along. Portals come in pairs: walk into one to come out of the other.')];
}
function survival() {
  const ship = Object.fromEntries(Object.entries(MOB_SETS.ship).map(([role, k]) => [role, MOBS[k].name]));
  const mobs = Object.entries(MOBS).filter(([, m]) => !m.role).map(([k, m]) => [m.name, ship[k] || '', m.hp, m.speed, m.dmg, 'Wave ' + m.from,
    m.blast ? 'Explodes' : m.ranged ? 'Throws hexes' : m.boss ? 'Boss' : m.big ? 'Big' : '']);
  return [note(`You and your allies against endless waves. Hits and kills earn gold: spend it on doors (gangplank gates on the ship), guns on the walls, elixirs, and the mystery cauldron (${SURVIVAL.boxCost} gold for a random gun). Fall and you're out until the next wave — or, after a few seconds, press the use key to buy back in for gold (dearer each time; with everyone down the run waits a little for anyone who can pay). Reach wave 10 to count it a win.`),
    el('h4', null, 'Monsters'), table(['Crypt', 'Drowned Fleet', 'Health', 'Speed', 'Hit', 'From', ''], mobs),
    note('Monster health grows every wave. Every fifth wave is a boss wave; every fourth, a pack of fast ones. Now and then comes a special round: a SWARM of the weakest (and far more of them), an ELITE wave of only the tough ones, or a BLOOD MOON, when everything runs faster.'),
    el('h4', null, 'Drops'), note('Monsters sometimes drop these; walk over them.'),
    table(['Drop', 'What it does'], [['MAX AMMO', "Fills everyone's guns"], ['DOUBLE GOLD', `Double gold for ${s(DROPS.double.ms)}`], ['INSTA-KILL', `Every hit kills for ${s(DROPS.insta.ms)}`], ['NUKE', 'Kills every monster on the map']]),
    el('h4', null, 'Elixirs'), note('Drink once per life, from the altars around the map.'),
    table(['Elixir', 'Cost', 'Effect'], Object.values(ELIXIRS).map(e => [e.name, e.cost, e.text])),
    el('h4', null, 'Supplies'), note('Stands in most sections; buy as often as you like.'),
    table(['Supply', 'Cost', 'Effect'], Object.values(SUPPLIES).map(u => [u.name, u.cost, u.text])),
    el('h4', null, 'Guns on the walls'),
    table(['Gun', 'Cost'], Object.values(WALL_BUYS).map(b => [gunName(b.w), b.cost])),
    el('h4', null, 'Doors'),
    table(['Crypt', 'Drowned Fleet', 'Cost'], Object.keys(DOORS.crypt).map(k => [DOORS.crypt[k].name, DOORS.ship[k]?.name || '', DOORS.crypt[k].cost]))];
}
function unlocks() {
  const skins = Object.entries(SKIN_UNLOCKS).sort((a, b) => a[1] - b[1]).map(([k, l]) => [PLAYER_SKIN_NAMES[k] || k, 'Level ' + l]);
  return [note('XP comes from kills, matches, wins and challenges. Levels unlock characters, hats, familiars, titles, kill effects and realms; feats (lifetime goals, in History & records) unlock the rest.'),
    el('h4', null, 'Characters'), note('The seven witches are free from the start.'), table(['Character', 'Unlocks'], skins),
    el('h4', null, 'Hats'), note('Witches only.'), table(['Hat', 'Unlocks'], Object.keys(HATS).filter(k => k !== 'none').map(k => [HATS[k].name, hatNeeds(k)])),
    el('h4', null, 'Familiars'), table(['Familiar', 'Unlocks'], Object.keys(FAMILIARS).filter(k => k !== 'none').map(k => [FAMILIARS[k].name, petNeeds(k)])),
    el('h4', null, 'Camos'), note('Each gun earns its own camos from the kills you make with it.'),
    table(['Camo', 'Unlocks'], Object.values(CAMOS).map(c => [c.name, c.kills ? `${c.kills} kills with that gun` : `Gold on ${c.goldGuns} guns (then on every gun)`])),
    el('h4', null, 'Titles'), table(['Title', 'Unlocks'], Object.values(TITLES).map(t => [t.name, 'Level ' + t.level])),
    el('h4', null, 'Kill effects'), table(['Effect', 'Unlocks'], Object.values(KILL_EFFECTS).map(k => [k.name, 'Level ' + k.level])),
    el('h4', null, 'Feats'), table(['Feat', 'Reward'], Object.keys(FEATS).map(id => [FEATS[id].text, featReward(id) || '']))];
}
function attachments() {
  return [note('One at a time, picked on the Customize card; it goes on every gun you carry.'),
    table(['Attachment', 'Effect', 'Unlocks'], Object.values(ATTACHMENTS).filter(a => a.name !== 'None').map(a => [a.name, a.text, 'Level ' + a.level]))];
}
const SECTIONS = [['Guns', guns], ['Modes', modes], ['Realms', realms], ['Spells', spells], ['Power-ups & events', events], ['Survival', survival], ['Unlocks', unlocks], ['Attachments', attachments]];

let current = 0;
function show(i) {
  current = i;
  document.querySelectorAll('#wikiTabs button').forEach((b, j) => b.classList.toggle('sel', j === i));
  $('wikiBody').replaceChildren(...SECTIONS[i][1]());
  $('wikiBody').scrollTop = 0;
}
export function initWiki() {
  const modal = $('wikiModal');
  $('wikiTabs').replaceChildren(...SECTIONS.map(([name], i) => { const b = el('button', 'ghost', name); b.type = 'button'; b.addEventListener('click', () => show(i)); return b; }));
  const close = () => { modal.hidden = true; $('openWiki').focus(); };
  $('openWiki').addEventListener('click', () => { modal.hidden = false; show(current); modal.querySelector('.modalClose').focus(); });
  modal.querySelector('.modalClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || modal.hidden) return;
    e.stopImmediatePropagation();
    close();
  }, true);
}
