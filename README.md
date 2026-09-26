# shooty

Two-player networked 3D arena shooter. No build step: the browser loads the ES modules directly.

```
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts the server when files change
npm run bots       # dev + a bot joins as your opponent (solo testing)
```

To use a different port:

```
PORT=4000 npm start            # Mac / Linux
$env:PORT=4000; npm start      # Windows (PowerShell)
set PORT=4000&& npm start      # Windows (Command Prompt)
```

For remote play run `ngrok http 3000` and share the URL.

## Solo testing with a bot

`npm run bots` (or `npm start -- --bots` without auto-restart) adds a server-side bot as your opponent the moment you connect. It's always ready, so just pick a level and click "I'm Here". It leaves when you do.

- **Roams** between random spots it can walk to in a straight line, avoiding walls and pits
- **Shoots** the rifle when it can see you within 25 units, after a short reaction delay and with some aim wobble
- Fires through the same `shoot` handler as a real player, so hits, kills, tracers, sounds and scoring all work normally

Speed, sight range, reaction time, fire rate and aim error are constants at the top of `server/bot.js`.

The game is 1v1, so there's one bot and it takes the second player slot: nobody else can join while bots are on.

## Profiles, accounts and leaderboard

Players set a name in the lobby and get saved stats (kills, deaths, K/D, wins, losses) plus their leaderboard rank. Matches against a bot don't count.

- **Guests:** no sign-up needed. The browser keeps a random secret key that identifies the profile, so clearing site data or switching browsers starts a new one.
- **Accounts:** "Create account" puts a username + password on your current profile (stats kept). "Sign in" on any other device switches that browser to your account. Passwords are hashed with scrypt; 5 wrong tries per minute locks out that IP for the rest of the minute. There's no password reset yet (no email on file).
- **Leaderboard:** top 10 in the lobby, ranked by wins, then kills, then fewest deaths. Only players with a finished match appear.

Locally, profiles are saved to `data/profiles.json` (git-ignored). On Render that file is wiped on every redeploy or restart, so use a free Postgres database instead:

1. Create a free database at [neon.tech](https://neon.tech) (or Supabase) and copy its connection string (`postgresql://...`)
2. In Render: your service → **Environment** → add `DATABASE_URL` with that string
3. Redeploy. The log should say `Profiles: Postgres`; tables are created (and upgraded) automatically

## Layout

| Path | What's in it |
|---|---|
| `server.js` | Entry point: HTTP + WebSocket wiring |
| `server/game.js` | Lobby, match state, respawns, pickups, pits, message handlers |
| `server/bot.js` | Solo-testing bot: roams, spots you, shoots (tuning constants at the top) |
| `server/profiles.js` | Saved profiles, accounts, sessions, leaderboard (Postgres or `data/profiles.json`) |
| `server/log.js` | Timestamped server log: joins, leaves, lobby, kills, wins |
| `server/combat.js` | Hitscan, shotgun pellets, melee (authoritative) |
| `server/static.js` | Serves `public/` and `shared/` |
| `shared/config.js` | Weapons, ammo, HP, tick rate (used by server **and** browser) |
| `shared/levels.js` | Map layouts |
| `shared/terrain.js` | Heightmap + collision helpers |
| `public/index.html`, `style.css` | Page + lobby |
| `public/js/main.js` | Client entry + frame loop |
| `public/js/state.js` | All mutable client state (`S`) |
| `public/js/profile.js`, `account.js` | Your profile key + name in the browser; lobby name, stats, sign-in, leaderboard |
| `public/js/net.js` | WebSocket + a handler per server message |
| `public/js/input.js`, `weapons.js`, `physics.js` | Controls, firing/switching, movement (bhop) |
| `public/js/level.js`, `themes.js` | Level loading, per-level colors/sounds |
| `public/js/audio.js` | Synthesized sound effects |
| `public/js/particles.js` | Blood, sparks, embers |
| `public/js/render/` | `world.js` 3D view, `hud.js` overlay + gun models, `sprites.js` enemy/pickup shapes |

## Common changes

- **Balance a weapon:** `shared/config.js`
- **New level:** map in `shared/levels.js` + theme in `public/js/themes.js` + floor in `FLOORS` (`public/js/level.js`) + sprite in `render/sprites.js` + button in `index.html`
- **New sound:** add to `SFX` in `public/js/audio.js`, call `play('name')`
- **New server message:** add a handler in `Game.prototype.handlers` (server) or `handlers` in `public/js/net.js` (client)

Website: https://shooty-g7pv.onrender.com/
