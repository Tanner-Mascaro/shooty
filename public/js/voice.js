// Voice chat: WebRTC audio straight between the browsers in a room (a full mesh; rooms hold at
// most 10). The server only relays the connection setup ('rtc' messages to one player).
//
// Everyone in the room is connected as soon as voice is on, so you hear others without a mic.
// Your mic is only asked for when you first talk (push to talk) or switch on open mic, and
// then the same track is fed to every connection: no renegotiation needed. In a teams match
// only your teammates get it. The lower player id makes the offer, so two browsers never
// both offer at once.
import { S, teamOf } from './state.js';
import { isTeamMode } from '/shared/config.js';
import { send } from './net.js';
import { settings, held } from './settings.js';
import { toast } from './ui.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const peers = new Map(); // player id -> { pc, sender, audio, pending: [ICE candidates before the offer/answer] }
export const muted = new Set(); // player ids you muted this session
let micTrack = null, micAsked = false;

export const voiceOn = () => settings.voice !== 'off';

// may this player hear you right now? (teams match: teammates only)
const hears = id => !(S.room && isTeamMode(S.room.mode) && S.room.gameOn && teamOf(id) !== S.myTeam);

// --- connections ---
function makePeer(id, offering) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const audio = new Audio();
  audio.autoplay = true;
  const peer = { pc, sender: null, audio, pending: [] };
  peers.set(id, peer);
  pc.onicecandidate = e => { if (e.candidate) send({ type: 'rtc', to: id, candidate: e.candidate }); };
  pc.ontrack = e => {
    audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    applyVolume();
    audio.play().catch(() => {}); // autoplay blocked until the page is clicked: see initVoice
  };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce?.(); };
  if (offering) {
    peer.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    pc.onnegotiationneeded = async () => {
      try { await pc.setLocalDescription(); send({ type: 'rtc', to: id, sdp: pc.localDescription }); } catch {}
    };
    feed(id);
  }
  return peer;
}

function dropPeer(id) {
  const peer = peers.get(id);
  if (!peer) return;
  peer.pc.close();
  peer.audio.srcObject = null;
  peers.delete(id);
}

// your mic to this peer, or silence if they shouldn't hear you
function feed(id) {
  const peer = peers.get(id);
  if (peer && peer.sender) peer.sender.replaceTrack(micTrack && hears(id) ? micTrack : null).catch(() => {});
}

// after every roster change: connect to new people, drop those who left, redo who hears you
export function syncVoice() {
  const others = S.room && voiceOn() ? S.room.players.filter(p => !p.bot && p.id !== S.myId).map(p => p.id) : [];
  for (const id of peers.keys()) if (!others.includes(id)) dropPeer(id);
  for (const id of others) if (!peers.has(id) && S.myId < id) makePeer(id, true);
  for (const id of peers.keys()) feed(id);
  if (!voiceOn() && micTrack) { micTrack.stop(); micTrack = null; micAsked = false; }
}

// an 'rtc' message relayed from another player: { from, sdp } or { from, candidate }
export async function onSignal(msg) {
  if (!voiceOn()) return;
  const peer = peers.get(msg.from) || (msg.sdp && msg.sdp.type === 'offer' ? makePeer(msg.from, false) : null);
  if (!peer) return;
  const pc = peer.pc;
  try {
    if (msg.sdp) {
      await pc.setRemoteDescription(msg.sdp);
      if (msg.sdp.type === 'offer') {
        const t = pc.getTransceivers()[0]; // the one the offer made; answer on it, sending too
        t.direction = 'sendrecv';
        peer.sender = t.sender;
        feed(msg.from);
        await pc.setLocalDescription();
        send({ type: 'rtc', to: msg.from, sdp: pc.localDescription });
      }
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (msg.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
      else peer.pending.push(msg.candidate);
    }
  } catch {}
}

// --- your mic ---
export async function askMic() {
  if (micTrack || micAsked || !voiceOn()) return;
  micAsked = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Voice chat needs https (or localhost)'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micTrack = stream.getAudioTracks()[0];
    micTrack.enabled = false;
    for (const id of peers.keys()) feed(id);
  } catch {
    toast('Microphone blocked — allow it in the address bar to talk');
  }
}

export function applyVolume() {
  for (const [id, peer] of peers) { peer.audio.volume = settings.voiceVol; peer.audio.muted = muted.has(id); }
}

export function toggleMute(id) {
  if (muted.has(id)) muted.delete(id); else muted.add(id);
  applyVolume();
}

// --- every frame ---
export const talking = new Set(); // ids heard in the last moment (you included while transmitting)
let lastLevels = 0;
export function updateVoice(now) {
  const sending = voiceOn() && !!micTrack && (settings.voice === 'open' || held('talk'));
  if (micTrack) micTrack.enabled = sending;
  if (now - lastLevels < 150) return;
  lastLevels = now;
  talking.clear();
  if (sending) talking.add(S.myId);
  for (const [id, peer] of peers) {
    const r = peer.pc.getReceivers()[0], src = r && r.getSynchronizationSources ? r.getSynchronizationSources()[0] : null;
    if (!src || muted.has(id)) continue;
    const age = src.timestamp > 1e12 ? Date.now() - src.timestamp : performance.now() - src.timestamp; // browsers differ on the clock
    if (src.audioLevel > 0.02 && age < 500) talking.add(id);
  }
  showTalking();
}

// who's talking: a list in the corner, and a glow on their lobby row
let shown = '';
function showTalking() {
  const key = [...talking].join(',');
  if (key === shown) return;
  shown = key;
  const el = document.getElementById('talking');
  el.replaceChildren(...[...talking].map(id => {
    const d = document.createElement('div');
    d.textContent = '🔊 ' + (id === S.myId ? 'You' : (S.room && S.room.players.find(p => p.id === id) || { name: '?' }).name);
    return d;
  }));
  document.querySelectorAll('#roster li[data-id]').forEach(li => li.classList.toggle('talking', talking.has(+li.dataset.id)));
}

export function initVoice() {
  // browsers hold back audio until the page is clicked: retry any that were blocked
  document.addEventListener('click', () => {
    for (const peer of peers.values()) if (peer.audio.srcObject && peer.audio.paused) peer.audio.play().catch(() => {});
    if (settings.voice === 'open') askMic();
  });
}

// for debugging from the console: [[player id, connection, ice, signaling state], ...]
export const voiceStatus = () => [...peers].map(([id, p]) => [id, p.pc.connectionState, p.pc.iceConnectionState, p.pc.signalingState]);
