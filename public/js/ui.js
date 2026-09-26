// DOM bits: lobby screen, center messages, HP bars.
import { S } from './state.js';
import { send } from './net.js';
import { initAudio } from './audio.js';
import { initAccount } from './account.js';

const $ = id => document.getElementById(id);
const wait = $('wait'), waitMsg = $('waitMsg'), readyBtn = $('readyBtn');

export function initLobby() {
  initAccount();
  readyBtn.addEventListener('click', () => {
    initAudio();
    send({ type: 'ready' });
    readyBtn.disabled = true;
    readyBtn.textContent = 'Ready!';
    waitMsg.textContent = 'Waiting for other player...';
  });
  document.querySelectorAll('#levels button').forEach(b => b.addEventListener('click', () => {
    initAudio();
    send({ type: 'level', level: b.dataset.level });
  }));
}

export function setWaitText(text) { waitMsg.textContent = text; }
export function setReady(enabled, label) { readyBtn.disabled = !enabled; if (label) readyBtn.textContent = label; }

export function showWait(text, btn) {
  wait.style.display = 'flex';
  setWaitText(text);
  setReady(true, btn);
  if (document.pointerLockElement) document.exitPointerLock();
}
export function hideWait() {
  wait.style.display = 'none';
  $('msg').style.opacity = 0;
}

export function applyLevelUI(name, theme) {
  document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('sel', b.dataset.level === name));
  const title = $('waitTitle');
  title.textContent = theme.name;
  title.style.color = theme.title;
  title.style.textShadow = '0 0 18px ' + theme.title;
  wait.style.background = 'radial-gradient(circle at 50% 60%, ' + theme.bg + ', #000 70%)';
}

// center-screen text; fades after 1.5s unless persist
export function showMsg(text, persist) {
  const el = $('msg');
  el.textContent = text;
  el.style.opacity = 1;
  if (!persist) setTimeout(() => el.style.opacity = 0, 1500);
}

// big animated banner drawn on the canvas (render/hud.js)
export function banner(text, gold) { S.bannerText = text; S.bannerT = performance.now(); S.bannerGold = gold; }

export function updateHud() {
  $('myhp').style.width = Math.max(0, S.me.hp) + '%';
  $('sk').textContent = S.myKills;
  if (S.enemy) { $('ename').textContent = (S.enemy.n || 'ENEMY').toUpperCase(); $('ehp').style.width = Math.max(0, S.enemy.hp) + '%'; $('ek').textContent = S.enemy.kills || 0; }
}
