# shooty

Networked 3D arena shooter for up to 8 players per room, free-for-all or red vs blue teams. No build step: the browser loads the ES modules directly.

```
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts the server when files change
npm run bots       # dev + bots for solo testing
```

To use a different port:

```
PORT=4000 npm start            # Mac / Linux
$env:PORT=4000; npm start      # Windows (PowerShell)
set PORT=4000&& npm start      # Windows (Command Prompt)
```

For remote play run `ngrok http 3000` and share the URL.

## Rooms, modes and friends

- **Rooms:** every game is a room with a short code, and the address bar is its invite link (`/?room=ABCDE`). **Quick play** puts you in any public room with space; **New private room** makes one only people with the link (or an invite) can join. Up to 8 players; you can join a match in progress.
- **Free-for-all:** first to 10 kills wins. **Teams:** red vs blue, first team to 20 kills; bullets pass through teammates. Pick a team in the lobby, or the game splits everyone if one side is empty.
- **Friends** (accounts only): add someone by username; once they accept you see whether they're online and which room they're in, and can **Invite** them (they get a popup with a Join button) or **Join** them.
- The match starts once everyone in the room clicks "I'm Here" (2+ players). It ends early if too few are left (or a team is empty).

Win scores and room size are in `shared/config.js`.

## Solo testing with a bot

`npm run bots` (or `npm start -- --bots` without auto-restart) puts a server-side bot in every new room, and the lobby gets **+ BOT / − BOT** buttons to fill a room for testing free-for-all or teams. Bots are always ready, so just pick a level and click "I'm Here". They leave when the last person does.

- **Roams** between random spots it can walk to in a straight line, avoiding walls and pits
- **Shoots** the rifle at the nearest enemy it can see within 25 units, after a short reaction delay and with some aim wobble
- Fires through the same `shoot` handler as a real player, so hits, kills, tracers, sounds and scoring all work normally

Speed, sight range, reaction time, fire rate and aim error are constants at the top of `server/bot.js`.

## Profiles, accounts and leaderboard

Players set a name in the lobby and get saved stats (kills, deaths, K/D, wins, losses) plus their leaderboard rank. Matches with a bot in them don't count.

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
| `server.js` | Entry point: HTTP + WebSocket wiring, dead-connection pings |
| `server/hub.js` | Everyone online: rooms by code, accounts, stats, friends, invites |
| `server/room.js` | One room's match: players, modes/teams, respawns, pickups, pits, match messages |
| `server/bot.js` | Solo-testing bot: roams, spots you, shoots (tuning constants at the top) |
| `server/profiles.js` | Saved profiles, accounts, sessions, leaderboard (Postgres or `data/profiles.json`) |
| `server/log.js` | Timestamped server log: joins, leaves, lobby, kills, wins |
| `server/combat.js` | Hitscan, shotgun pellets, melee against many targets (authoritative) |
| `server/static.js` | Serves `public/` and `shared/` |
| `shared/config.js` | Weapons, ammo, HP, tick rate (used by server **and** browser) |
| `shared/levels.js` | Map layouts |
| `shared/terrain.js` | Heightmap + collision helpers |
| `public/index.html`, `style.css` | Page + lobby |
| `public/js/main.js` | Client entry + frame loop |
| `public/js/state.js` | All mutable client state (`S`) |
| `public/js/room.js`, `friends.js` | Lobby room panel (code, invite link, mode, teams, ready); friends list + invite popup |
| `public/js/profile.js`, `account.js` | Your profile key + name in the browser; lobby name, stats, sign-in, leaderboard |
| `public/js/net.js` | WebSocket (joins the `?room=` in the URL) + a handler per server message |
| `public/js/input.js`, `weapons.js`, `physics.js` | Controls, firing/switching, movement (bhop) |
| `public/js/level.js`, `themes.js` | Level loading, per-level colors/sounds |
| `public/js/audio.js` | Synthesized sound effects |
| `public/js/particles.js` | Blood, sparks, embers |
| `public/js/ui.js` | Lobby show/hide, toasts, HP bar, scoreboard, kill feed |
| `public/js/render/` | `world.js` 3D view, `hud.js` overlay, name tags + gun models, `sprites.js` player/pickup shapes |

## Common changes

- **Balance a weapon:** `shared/config.js`
- **New level:** map in `shared/levels.js` + theme in `public/js/themes.js` + floor in `FLOORS` (`public/js/level.js`) + sprite in `render/sprites.js` + button in `index.html`
- **New sound:** add to `SFX` in `public/js/audio.js`, call `play('name')`
- **New server message:** add a handler in `Room.prototype.handlers` (match) or `Hub.prototype.handlers` (everything else) on the server, or `handlers` in `public/js/net.js` on the client

Website: https://shooty-g7pv.onrender.com/
