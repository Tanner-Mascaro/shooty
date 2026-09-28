// All sounds are synthesized with WebAudio, no asset files.
// Browsers only allow audio after a user gesture, so initAudio() is called from click handlers.
import { S } from './state.js';
import { settings } from './settings.js';

let actx = null, master = null, verb = null, noiseBuf = null, windGain = null, sizzleGain = null, droneOsc = [], droneLp = null, droneGain = null;

export function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain(); master.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // cavernous reverb for gunshots
  const len = actx.sampleRate * 2.5, ir = actx.createBuffer(2, len, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const dd = ir.getChannelData(ch); for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  verb = actx.createConvolver(); verb.buffer = ir; verb.connect(master);
  const loop = (filter, freq) => {
    const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = actx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = 0.7;
    const g = actx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    return g;
  };
  windGain = loop('bandpass', 500);    // swells with bhop speed
  sizzleGain = loop('highpass', 2500); // standing in a pit
  // ambient level drone
  droneLp = actx.createBiquadFilter(); droneLp.type = 'lowpass';
  droneGain = actx.createGain(); droneLp.connect(droneGain); droneGain.connect(master);
  droneOsc = [0, 1, 2].map(() => { const o = actx.createOscillator(); o.connect(droneLp); o.start(); return o; });
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = actx.createGain(); lg.gain.value = 80; lfo.connect(lg); lg.connect(droneLp.frequency); lfo.start();
  updateDrone();
}

export function updateDrone() {
  if (!actx || !S.theme) return;
  droneOsc.forEach((o, i) => { o.type = S.theme.drone[i][0]; o.frequency.value = S.theme.drone[i][1]; });
  droneLp.frequency.value = S.theme.droneCut;
  applyVolume();
}

// master and background (level hum) volume from settings, 0..1 each
export function applyVolume() {
  if (!actx) return;
  master.gain.setTargetAtTime(0.6 * settings.volume, actx.currentTime, 0.05);
  if (S.theme) droneGain.gain.setTargetAtTime(0.05 * (S.theme.droneVol ?? 1) * settings.ambient, actx.currentTime, 0.05);
  syncMusic();
}

// --- lobby music: a few spooky tunes, one picked at random, with the odd witch cackle ---
// Plays on the home screen and in the lobby, fades out while a match is on.
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
let musicGain = null, musicTimer = 0, nextNote = 0, step = 0, track = null;

function voiced(out, o) { // a sung vowel: sawtooth through "ah" formants, with vibrato
  const t = o.t, s = actx.createOscillator(); s.type = 'sawtooth';
  s.frequency.setValueAtTime(o.f, t);
  s.frequency.linearRampToValueAtTime(o.f * 1.12, t + o.dur * 0.25);
  s.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const lfo = actx.createOscillator(), lg = actx.createGain();
  lfo.frequency.value = o.vibHz || 7; lg.gain.value = o.vib || 10; lfo.connect(lg); lg.connect(s.frequency);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + 0.012);
  g.gain.setValueAtTime(o.vol, t + o.dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  for (const [freq, q, amp] of [[850, 6, 1], [1250, 7, 0.6], [2700, 9, 0.35]]) {
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const a = actx.createGain(); a.gain.value = amp;
    s.connect(f); f.connect(a); a.connect(g);
  }
  g.connect(out);
  s.start(t); lfo.start(t); s.stop(t + o.dur + 0.05); lfo.stop(t + o.dur + 0.05);
}
// "ah-HA-ha-ha-ha-ha-haaaa": breathy hits sliding down, then a long wavering one
function laugh(out, delay = 0) {
  let t = actx.currentTime + delay, f = 640 + Math.random() * 80;
  for (let i = 0; i < 7; i++) {
    noise(out, { filter:'bandpass', freq:1900, q:1, dur:0.05, vol:0.25, delay:t - actx.currentTime });
    voiced(out, { t: t + 0.025, f, to: f * 0.86, dur: 0.1, vol: 0.5 });
    t += 0.12 + i * 0.012; f *= 0.955;
  }
  voiced(out, { t: t + 0.05, f: f * 1.25, to: f * 0.62, dur: 0.95, vol: 0.45, vib: 28, vibHz: 6 });
}

// a soft held chord tone: two slightly detuned triangles through a low-pass, swelling in and out
function pad(freq, dur, vol, t, attack = 1) {
  const at = actx.currentTime + t, f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  g.gain.setValueAtTime(vol, at + Math.max(attack, dur - 1.2));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  for (const d of [-4, 4]) {
    const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq; o.detune.value = d;
    o.connect(f); o.start(at); o.stop(at + dur + 0.05);
  }
  f.connect(g); g.connect(musicGain);
}

// each track: the length of one step, and what plays on step n (t = seconds from now)
const TRACKS = [
  { // Music box: D minor i-VI-iv-V, six eighths a bar, over an organ
    step: 0.32,
    play(n, t) {
      const CH = [[38, [62, 65, 69, 74]], [34, [58, 62, 65, 70]], [43, [55, 58, 62, 67]], [33, [57, 61, 64, 69]]];
      const bar = Math.floor(n / 6), i = n % 6, [bass, notes] = CH[Math.floor(bar / 2) % 4];
      const f = midi(notes[[0, 1, 2, 3, 2, 1][i]] + 12);
      tone(musicGain, { type:'triangle', freq:f, dur:1.1, vol:0.16, delay:t, attack:0.004 });
      tone(musicGain, { freq:f * 2, dur:0.5, vol:0.05, delay:t, attack:0.004 });
      if (i === 0 && bar % 2 === 0) {
        pad(midi(bass + 12), 3.8, 0.09, t, 0.5);
        pad(midi(bass + 19), 3.8, 0.04, t, 0.8);
      }
      if (i === 0 && bar % 8 === 0) tone(musicGain, { freq:midi(86), dur:3, vol:0.07, delay:t, attack:0.01 });
      return i === 0 && bar % 8 === 7;
    },
  },
  { // Witch's waltz: A minor oom-pah-pah on soft plucks, a tune that sits on each chord
    step: 0.26,
    play(n, t) {
      // eight bars of three beats: Am E Am Dm Am E Am Am
      const CH = [[45, [57, 60, 64]], [40, [56, 59, 62]], [45, [57, 60, 64]], [38, [57, 62, 65]], [45, [57, 60, 64]], [40, [56, 59, 62]], [45, [57, 60, 64]], [45, [57, 60, 64]]];
      const MEL = [76, 0, 72, 71, 0, 68, 69, 72, 76, 77, 0, 74, 76, 0, 72, 71, 74, 71, 69, 0, 0, 0, 0, 0];
      const bar = Math.floor(n / 3) % 8, beat = n % 3, [bass, chord] = CH[bar];
      if (beat === 0) tone(musicGain, { type:'triangle', freq:midi(bass - 12), dur:0.7, vol:0.2, delay:t });
      else chord.forEach(c => tone(musicGain, { type:'triangle', freq:midi(c), dur:0.22, vol:0.035, delay:t, attack:0.003 }));
      const m = MEL[n % MEL.length];
      if (m) {
        tone(musicGain, { type:'triangle', freq:midi(m), dur:0.55, vol:0.1, delay:t, attack:0.01 });
        tone(musicGain, { freq:midi(m) * 2, dur:0.3, vol:0.025, delay:t, attack:0.01 });
      }
      return beat === 0 && bar === 7;
    },
  },
  { // Cauldron: a slow heartbeat drum under a wavering theremin, E phrygian
    step: 0.5,
    play(n, t) {
      const MEL = [64, 65, 67, 65, 64, 0, 62, 60, 59, 0, 60, 62, 64, 0, 0, 0];
      if (n % 4 === 0) { // lub-dub, with enough body and skin to hear on laptop speakers
        for (const [dt, v] of [[0, 1], [0.24, 0.65]]) {
          tone(musicGain, { freq:120, to:55, dur:0.3, vol:0.35 * v, delay:t + dt });
          noise(musicGain, { freq:900, to:200, dur:0.12, vol:0.25 * v, delay:t + dt });
        }
      }
      if (n % 16 === 0) { pad(midi(52), 8, 0.08, t, 2); pad(midi(59), 8, 0.04, t, 2.5); }
      const m = MEL[n % MEL.length];
      if (m) {
        const s = actx.createOscillator(), g = actx.createGain(), lfo = actx.createOscillator(), lg = actx.createGain(), at = actx.currentTime + t;
        s.frequency.setValueAtTime(midi(m) * 0.97, at); s.frequency.exponentialRampToValueAtTime(midi(m), at + 0.15);
        lfo.frequency.value = 5.5; lg.gain.value = 6; lfo.connect(lg); lg.connect(s.frequency);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.16, at + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);
        s.connect(g); g.connect(musicGain); s.start(at); lfo.start(at); s.stop(at + 1); lfo.stop(at + 1);
      }
      return n % 32 === 30;
    },
  },
  { // Coven bells: bells on a minor pentatonic, a low toll, and a chanting pad
    step: 0.4,
    play(n, t) {
      const SCALE = [69, 72, 74, 76, 79, 81, 84];
      if (n % 2 === 0 || Math.random() < 0.3) {
        const f = midi(SCALE[(n * 3 + Math.floor(n / 8)) % SCALE.length]);
        tone(musicGain, { freq:f, dur:2.2, vol:0.06, delay:t, attack:0.003 });
        tone(musicGain, { freq:f * 2.76, dur:0.9, vol:0.018, delay:t, attack:0.003 }); // the bell's clang
      }
      if (n % 8 === 0) tone(musicGain, { freq:midi(45), dur:4, vol:0.14, delay:t, attack:0.005 });
      if (n % 16 === 0) [57, 60, 64].forEach(c => pad(midi(c), 6, 0.035, t, 1.5));
      return n % 32 === 28;
    },
  },
];

function scheduleMusic() {
  while (nextNote < actx.currentTime + 0.4) {
    if (track.play(step, nextNote - actx.currentTime) && Math.random() < 0.35) laugh(musicGain, nextNote - actx.currentTime + track.step * 2); // now and then…
    nextNote += track.step; step++;
  }
}

// a different tune: picked at random each time the music starts, and again when you sign in
export function newTrack() {
  const others = TRACKS.filter(x => x !== track);
  track = others[Math.floor(Math.random() * others.length)];
  step = 0;
  if (actx) nextNote = Math.max(nextNote, actx.currentTime + 0.1);
}

export function syncMusic() {
  if (!actx) return;
  if (!musicGain) {
    musicGain = actx.createGain(); musicGain.gain.value = 0;
    musicGain.connect(master);
    const wet = actx.createGain(); wet.gain.value = 0.5; musicGain.connect(wet); wet.connect(verb);
  }
  const on = !S.started && settings.music > 0;
  musicGain.gain.setTargetAtTime(on ? 0.5 * settings.music : 0, actx.currentTime, on ? 0.6 : 0.25);
  if (on && !musicTimer) {
    if (!track) newTrack(); // back from a match: carry on with the same tune where it left off
    nextNote = actx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 120);
  } else if (!on && musicTimer) {
    clearInterval(musicTimer); musicTimer = 0;
  }
}

// the lobby's own cackle (I'm Ready), on the music volume
export function cackle() {
  if (!actx || !musicGain || settings.music <= 0) return;
  laugh(musicGain);
}

function setLoop(g, v) { if (g) g.gain.setTargetAtTime(v, actx.currentTime, 0.1); }
export const setWind = v => setLoop(windGain, v);
export const setSizzle = v => setLoop(sizzleGain, v);

// --- building blocks ---
function bus(vol, pan, wet) {
  const g = actx.createGain(); g.gain.value = vol;
  let o = g;
  if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; g.connect(p); o = p; }
  o.connect(master);
  if (wet) { const s = actx.createGain(); s.gain.value = wet; o.connect(s); s.connect(verb); }
  return g;
}
function noise(out, o) {
  const t = actx.currentTime + (o.delay || 0);
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(o.freq || 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol || 1, t + (o.attack || 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.8); s.stop(t + o.dur + 0.02);
}
function tone(out, o) {
  const t = actx.currentTime + (o.delay || 0);
  const s = actx.createOscillator(); s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.freq, t);
  if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol || 0.3, t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(g); g.connect(out);
  s.start(t); s.stop(t + o.dur + 0.02);
}

// --- sounds: (volume, stereo pan) ---
const SFX = {
  pistol(v, p) { const o = bus(v * 0.85, p, 0.15); noise(o, { filter:'bandpass', freq:2200, q:0.9, dur:0.08, vol:0.9 }); noise(o, { freq:700, dur:0.12, vol:0.6 }); tone(o, { type:'square', freq:240, to:80, dur:0.05, vol:0.2 }); },
  deagle(v, p) { const o = bus(v, p, 0.25); noise(o, { filter:'bandpass', freq:1800, q:0.8, dur:0.12, vol:1 }); noise(o, { freq:400, dur:0.22, vol:0.9 }); tone(o, { type:'square', freq:140, to:45, dur:0.1, vol:0.35 }); },
  rifle(v, p) { const o = bus(v, p, 0.15); noise(o, { filter:'bandpass', freq:1800, q:0.8, dur:0.12, vol:0.9 }); noise(o, { freq:500, dur:0.18, vol:0.8 }); tone(o, { type:'square', freq:160, to:50, dur:0.08, vol:0.25 }); },
  smg(v, p) { const o = bus(v * 0.8, p, 0.1); noise(o, { filter:'bandpass', freq:2600, q:0.9, dur:0.07, vol:0.8 }); noise(o, { freq:800, dur:0.1, vol:0.6 }); tone(o, { type:'square', freq:220, to:90, dur:0.05, vol:0.18 }); },
  shotgun(v, p) { const o = bus(v, p, 0.4); noise(o, { freq:1400, to:300, dur:0.4, vol:1.3 }); tone(o, { freq:95, to:32, dur:0.45, vol:1.1 }); noise(o, { filter:'bandpass', freq:700, q:1, dur:0.2, vol:0.7 }); },
  pump(v, p) { const o = bus(0.6 * v, p); noise(o, { filter:'bandpass', freq:1200, q:2, dur:0.07, vol:0.8 }); noise(o, { filter:'bandpass', freq:1800, q:2, dur:0.07, vol:0.8, delay:0.16 }); },
  sniper(v, p) {
    const o = bus(v, p, 0.6);
    noise(o, { filter:'highpass', freq:3500, dur:0.04, vol:1 });     // crack
    noise(o, { freq:2500, to:400, dur:0.4, vol:1.2 });                 // blast
    tone(o, { freq:75, to:26, dur:1.0, vol:1.3 });                     // sub boom
    noise(o, { filter:'bandpass', freq:900, q:2, dur:0.12, vol:0.5 }); // body
    noise(o, { freq:600, dur:1.1, vol:0.35, delay:0.18, attack:0.08 }); // rolling echo
  },
  beam(v, p) {
    const o = bus(v * 0.9, p, 0.35);
    tone(o, { type:'sawtooth', freq:920, to:220, dur:0.14, vol:0.35 });
    tone(o, { type:'square', freq:1480, to:480, dur:0.1, vol:0.18 });
    noise(o, { filter:'bandpass', freq:4200, q:2.5, dur:0.08, vol:0.7 });
    noise(o, { filter:'highpass', freq:6000, dur:0.12, vol:0.45, attack:0.01 });
    tone(o, { freq:110, to:40, dur:0.18, vol:0.25 });
  },
  bolt() { const o = bus(0.6, 0); noise(o, { filter:'bandpass', freq:2500, q:3, dur:0.05, vol:0.8 }); tone(o, { type:'square', freq:300, to:200, dur:0.03, vol:0.1 }); noise(o, { filter:'bandpass', freq:1700, q:3, dur:0.06, vol:0.8, delay:0.2 }); },
  magOut() { const o = bus(0.5, 0); noise(o, { filter:'bandpass', freq:1100, q:3, dur:0.05, vol:0.8 }); noise(o, { freq:400, dur:0.08, vol:0.4, delay:0.12 }); },
  magIn() { const o = bus(0.6, 0); noise(o, { filter:'bandpass', freq:1600, q:3, dur:0.05, vol:0.9 }); tone(o, { type:'square', freq:260, to:180, dur:0.03, vol:0.12 }); noise(o, { filter:'bandpass', freq:2600, q:3, dur:0.05, vol:0.7, delay:0.1 }); },
  dry() { const o = bus(0.4, 0); noise(o, { filter:'bandpass', freq:3000, q:4, dur:0.03, vol:0.7 }); },
  heal(v, p) { const o = bus(v * 0.6, p, 0.3); [523, 659, 784, 1047].forEach((f, i) => tone(o, { freq:f, dur:0.25, vol:0.22, delay:i * 0.06 })); noise(o, { filter:'highpass', freq:6000, dur:0.4, vol:0.3, attack:0.05 }); },
  cackle(v, p) { const o = bus(v * 0.7, p, 0.4); [880, 820, 770, 720, 680].forEach((f, i) => { tone(o, { type:'sawtooth', freq:f, to:f * 0.8, dur:0.09, vol:0.2, delay:i * 0.12 }); noise(o, { filter:'bandpass', freq:2200, q:3, dur:0.08, vol:0.4, delay:i * 0.12 }); }); },
  pickup(v, p) { const o = bus(v * 0.6, p, 0.2); noise(o, { filter:'bandpass', freq:1500, q:2, dur:0.06, vol:0.8 }); tone(o, { type:'triangle', freq:660, dur:0.12, vol:0.3, delay:0.05 }); tone(o, { type:'triangle', freq:990, dur:0.2, vol:0.3, delay:0.13 }); },
  scope(on) { const o = bus(0.5, 0); noise(o, { filter:'bandpass', freq:on ? 3500 : 2200, q:4, dur:0.05, vol:0.6 }); },
  swap() { const o = bus(0.5, 0); noise(o, { filter:'bandpass', freq:1500, q:3, dur:0.04, vol:0.6 }); noise(o, { filter:'bandpass', freq:2800, q:3, dur:0.04, vol:0.5, delay:0.12 }); },
  swing(v, p) { const o = bus(v * 0.7, p); noise(o, { filter:'bandpass', freq:400, to:2500, q:1.5, dur:0.2, vol:0.9, attack:0.05 }); },
  slash(v, p) { const o = bus(v, p, 0.2); noise(o, { filter:'highpass', freq:3000, dur:0.1, vol:0.8 }); tone(o, { freq:150, to:60, dur:0.14, vol:0.6 }); noise(o, { freq:600, dur:0.15, vol:0.7 }); },
  backstab() { const o = bus(1, 0, 0.4); noise(o, { filter:'highpass', freq:2500, dur:0.15, vol:1 }); tone(o, { type:'sawtooth', freq:110, to:35, dur:0.6, vol:0.4 }); },
  whiz(v, p) { const o = bus(v, p); noise(o, { filter:'bandpass', freq:5000, to:1500, q:2, dur:0.12, vol:1 }); },
  slide() { const o = bus(0.6, 0); noise(o, { filter:'bandpass', freq:900, to:350, q:0.8, dur:0.6, vol:0.7, attack:0.03 }); noise(o, { filter:'highpass', freq:3000, dur:0.3, vol:0.25 }); },
  jump(v, p) { const o = bus(v * 0.5, p); noise(o, { freq:900, dur:0.12, vol:0.4, attack:0.02 }); },
  land(v, p) { const o = bus(v, p); noise(o, { freq:350, dur:0.12, vol:0.6 }); tone(o, { freq:90, to:45, dur:0.1, vol:0.3 }); },
  step(v, p) { const o = bus(v * 0.35, p); noise(o, { freq:500 + Math.random() * 300, dur:0.07, vol:0.6 }); },
  hitmarker() { const o = bus(0.4, 0); tone(o, { type:'square', freq:1400, dur:0.05, vol:0.2 }); tone(o, { type:'square', freq:2100, dur:0.04, vol:0.15, delay:0.02 }); },
  headshot() { const o = bus(0.6, 0, 0.3); tone(o, { freq:2600, dur:0.4, vol:0.3 }); tone(o, { freq:3900, dur:0.3, vol:0.15 }); noise(o, { freq:1200, dur:0.08, vol:0.8 }); },
  hurt() { const o = bus(0.6, 0); tone(o, { type:'sawtooth', freq:220, to:90, dur:0.2, vol:0.25 }); noise(o, { freq:400, dur:0.15, vol:0.5 }); },
  kill() { const o = bus(0.5, 0, 0.2); tone(o, { freq:60, to:40, dur:0.3, vol:0.8 }); tone(o, { type:'triangle', freq:880, dur:0.12, vol:0.35 }); tone(o, { type:'triangle', freq:1320, dur:0.3, vol:0.35, delay:0.09 }); },
  death() { const o = bus(0.6, 0, 0.3); tone(o, { type:'sawtooth', freq:300, to:50, dur:0.7, vol:0.3 }); },
  burn(v, p) { const o = bus(0.7 * v, p, 0.3); noise(o, { filter:'highpass', freq:1500, dur:1.2, vol:0.9, attack:0.05 }); tone(o, { type:'sawtooth', freq:200, to:40, dur:1, vol:0.3 }); },
  thud(v, p) { const o = bus(v, p); tone(o, { freq:70, to:35, dur:0.25, vol:0.8 }); noise(o, { freq:300, dur:0.2, vol:0.6 }); },
  streak() { const o = bus(0.5, 0, 0.35); [392, 523, 659, 784].forEach((f, i) => tone(o, { type:'sawtooth', freq:f, dur:0.16, vol:0.14, delay:i * 0.06 })); tone(o, { type:'triangle', freq:1568, dur:0.5, vol:0.22, delay:0.26 }); },
  win() { const o = bus(0.5, 0, 0.3); [523, 659, 784, 1047].forEach((f, i) => tone(o, { type:'triangle', freq:f, dur:0.3, vol:0.3, delay:i * 0.12 })); },
  lose() { const o = bus(0.5, 0, 0.3); [392, 330, 262, 196].forEach((f, i) => tone(o, { type:'triangle', freq:f, dur:0.35, vol:0.3, delay:i * 0.15 })); },
  nade(v, p) {
    const o = bus(v, p, 0.5);
    noise(o, { filter:'highpass', freq:2500, dur:0.08, vol:1.2 });
    noise(o, { freq:1800, to:200, dur:0.55, vol:1.4 });
    tone(o, { freq:70, to:28, dur:0.7, vol:1.2 });
    noise(o, { freq:500, dur:0.9, vol:0.4, delay:0.1, attack:0.05 });
  },
};

export function play(name, vol, pan) {
  if (!actx || !SFX[name]) return;
  try { SFX[name]((vol === undefined ? 1 : vol) * settings.sfx, pan || 0); } catch (e) {}
}

// volume/pan for a sound coming from a world position
export function spatial(x, y) {
  const me = S.me;
  if (!me) return { vol: 1, pan: 0 };
  const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
  return { vol: 1 / (1 + d * 0.3), pan: Math.max(-1, Math.min(1, Math.sin(Math.atan2(dy, dx) - me.a))) };
}
export function playAt(name, x, y, boost) { const s = spatial(x, y); play(name, s.vol * (boost || 1), s.pan); }
