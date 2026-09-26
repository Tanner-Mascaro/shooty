// Timestamped server log lines, e.g. "[2026-09-25 14:03:12] Player 0 (1.2.3.4) connected".
// They go to stdout: the terminal locally, the Logs tab on a host like Render.
export function log(msg) {
  const t = new Date().toLocaleString('sv-SE'); // server's local time, YYYY-MM-DD HH:MM:SS
  console.log(`[${t}] ${msg}`);
}

// the visitor's address; behind a proxy (ngrok, Render) the real one is in x-forwarded-for
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '?').trim().replace(/^::ffff:/, '');
}
