// Instant-replay clips: while you're in a match the canvas (and game audio) are buffered,
// and the clip key saves the last few seconds as a .webm download.
import { canvas } from './render/canvas.js';
import { clipAudioTrack } from './audio.js';
import { toast } from './ui.js';
import { S } from './state.js';

const CLIP_MS = 12000;
const CHUNK_MS = 1000;

let recorder = null, initChunk = null, chunks = [], mime = '';

function pickMime() {
  for (const t of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

export function syncClipBuffer() {
  if (!S.started) { stopClipBuffer(); return; }
  if (recorder || !canvas.width) return;
  mime = pickMime();
  if (!mime) return;
  try {
    const stream = canvas.captureStream(30);
    const audio = clipAudioTrack();
    if (audio) stream.addTrack(audio);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    initChunk = null;
    chunks = [];
    recorder.ondataavailable = e => {
      if (!e.data || !e.data.size) return;
      if (!initChunk) { initChunk = e.data; return; }
      chunks.push({ t: performance.now(), data: e.data });
      const cut = performance.now() - CLIP_MS - CHUNK_MS;
      while (chunks.length && chunks[0].t < cut) chunks.shift();
    };
    recorder.onerror = () => stopClipBuffer();
    recorder.start(CHUNK_MS);
  } catch {
    recorder = null;
  }
}

export function stopClipBuffer() {
  if (!recorder) return;
  try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
  // only stop the canvas video track — the audio tap stays alive for the next match
  recorder.stream.getTracks().forEach(t => { if (t.kind === 'video') t.stop(); });
  recorder = null;
  initChunk = null;
  chunks = [];
}

export function saveClip() {
  if (!window.MediaRecorder || !pickMime()) {
    toast('Clips need a browser that can record WebM (Chrome/Edge/Firefox)');
    return;
  }
  if (!S.started) {
    toast('Clips only work in a match');
    return;
  }
  syncClipBuffer();
  if (!initChunk || !chunks.length) {
    toast('Play a few seconds first, then save a clip');
    return;
  }
  const blob = new Blob([initChunk, ...chunks.map(c => c.data)], { type: mime || 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shooty-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.webm';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  toast('Clip saved (' + Math.round(blob.size / 1024) + ' KB)');
}
