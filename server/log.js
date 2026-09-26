// Timestamped server log lines, e.g. "[2026-09-25 14:03:12] Player 0 (1.2.3.4) connected".
// They go to stdout: the terminal locally, the Logs tab on a host like Render.
export function log(msg) {
  const t = new Date().toLocaleString('sv-SE'); // server's local time, YYYY-MM-DD HH:MM:SS
  console.log(`[${t}] ${msg}`);
}

// Use forwarded client IPs only when the hosting proxy is trusted and TRUST_PROXY is enabled.
export function clientIp(req, trustProxy = false) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = trustProxy && fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '?';
  return ip.trim().replace(/^::ffff:/, '');
}
