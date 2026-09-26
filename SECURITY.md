# Playtest deployment security

The playtest remains open to anyone with the site URL. Accounts are optional; guests can still play.
The WebSocket origin allowlist checks that browser connections come from the game site; it does not require a tester account or an invite code.

## Hosting configuration

- Serve the site only over HTTPS and allow WebSocket upgrades only over WSS. The Node server expects the hosting proxy to terminate TLS and redirect plain HTTP to HTTPS.
- Set `NODE_ENV=production` and `ALLOWED_ORIGINS` to the exact HTTPS origin(s) serving the game, separated by commas. Production startup fails without an origin allowlist.
- Set `TRUST_PROXY=1` only when requests come through your trusted hosting proxy. It enables the proxy-provided client IP for login throttling and per-IP connection limits. Keep it off if the Node server is directly exposed.
- Set `DATABASE_URL` through the host's secret manager if using Postgres. Keep credentials out of source control. `data/profiles.json` is suitable for local use, not a durable hosted database.
- Configure automatic database backups and restrict access to production logs; logs include player IP addresses.
- Do not enable `ENABLE_DEV_CHEATS` in production. In local development, set it to `1` only when you intentionally want the name-based cheat easter egg.

The server limits WebSocket messages to 32 KiB, checks the browser origin, caps concurrent connections globally and per IP, and disconnects clients sending more than 120 messages per second. Client movement updates are sent at 30 Hz and checked against server-side speed and map bounds. These are abuse controls, not a guarantee against a distributed denial of service.

## Account notes

New accounts require passwords of 15 to 72 characters. Passwords are salted and hashed with scrypt. Existing accounts remain able to sign in with their existing password. Login failures are throttled per connection (5 attempts/minute), client IP (5 failures/minute), and normalized username (10 failures/minute); when running behind a proxy, set `TRUST_PROXY=1` so separate players do not share the proxy's IP bucket.

## Local setup

Copy `.env.example` to `.env`, replace the example origin with the local deployment origin, and keep `.env` untracked. For local development, omit `NODE_ENV=production` and `ALLOWED_ORIGINS`; localhost origins are allowed automatically. Do not expose the development server to the public internet without configuring an explicit allowed origin and HTTPS termination.
