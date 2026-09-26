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

## Plague

Choose **PLAGUE** in the lobby and ready up with at least two players (bots work too). Under **STARTING INFECTION**, choose **1 RANDOM PLAYER / BOT** to pick exactly one starting monster each round, or **CHOOSE PLAYERS** to set each player and bot to **Infected** or **Healthy** in the player list. Manual setup requires at least one of each. Any player can change the setup before the round; changes reset everyone's ready status.

- A plague player's kill infects the victim: they respawn as a monster and hunt the remaining healthy players.
- Healthy players use normal weapons and have 100 health. Infected players and bots have 300 health, move 2 times as fast, and get a double jump (release and press jump again in the air). Infected spawn and respawn at full health, and health pickups heal up to their 300-health cap.
- Press **Left Shift** to dash in your movement direction, or forward when standing still. The burst lasts 0.2 seconds with a 2-second cooldown, works in the air, and stops at walls. The HUD shows when the dash is ready; its key can be changed in Settings.
- Infected players only use claws: the main shoot button (left click) attacks, and holding it repeats attacks, with no on-screen claw sprite. Each hit deals 50 damage, so a full-health survivor takes two hits. Claws have no headshot or backstab bonus. Infected players cannot equip, fire, reload, or pick up guns; health pickups still work.
- Infected bots chase survivors at the increased speed, dash to close the distance, and attack with claws. Teammates cannot hurt each other. Killing a monster does not cure it; pit deaths do not infect healthy players.
- The plague wins when nobody is healthy. The healthy team wins if anyone survives for three minutes. The HUD shows your side, survivors and time remaining.
- Players and bots joining a round in progress join the plague. If the last monster leaves, the healthy team wins; if the last healthy player leaves, the plague wins.
- Random setup picks again each rematch. Manual setup remembers your starting roles, independently of infections during a round. New arrivals in the lobby default to Healthy and can be reassigned. Your selected character returns in the lobby and whenever you are healthy.

Change `PLAGUE_DURATION`, `PLAGUE_SPEED_MULTIPLIER`, `PLAGUE_MAX_HP`, `PLAGUE_JUMPS`, `PLAGUE_DASH_SPEED`, `PLAGUE_DASH_DURATION`, `PLAGUE_DASH_COOLDOWN`, or `WEAPONS.claws` in `shared/config.js` to tune the mode.

Run `npm test` for server checks covering infection, friendly fire, round endings, late joins, rematches, and the original game modes.

## Bots

Any room can be filled out with server-side bots using the lobby's **+ BOT / − BOT** buttons, in free-for-all or teams. Bots are always ready, so a solo player can just add a few and click "I'm Here". They only take empty seats: when a person joins a full room, a bot leaves to make space. They leave when the last person does. Matches with a bot in them don't count toward saved stats.

`npm run bots` (or `npm start -- --bots` without auto-restart) also starts every new room with one bot, for local testing.

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
| `shared/levels.js` | Map layouts (40x40; legend at the top of the file) |
| `shared/terrain.js` | Turns a map into a heightmap with smooth per-level shapes (volcanoes, trees, server racks), plus collision helpers |
| `public/index.html`, `style.css` | Page + lobby |
| `public/js/main.js` | Client entry + frame loop |
| `public/js/state.js` | All mutable client state (`S`) |
| `public/js/room.js`, `friends.js` | Lobby room panel (code, invite link, mode, teams, ready); friends list + invite popup |
| `public/js/profile.js`, `account.js` | Your profile key + name in the browser; lobby name, stats, sign-in, leaderboard |
| `public/js/net.js` | WebSocket (joins the `?room=` in the URL) + a handler per server message |
| `public/js/input.js`, `weapons.js`, `physics.js` | Controls, firing/reloading/switching, movement (bhop) |
| `public/js/settings.js` | Settings panel: FPS limit, sensitivity, key bindings, fullscreen (saved in the browser) |
| `public/js/level.js`, `themes.js` | Level loading, per-level colors/sounds |
| `public/js/audio.js` | Synthesized sound effects |
| `public/js/particles.js` | Blood, sparks, embers |
| `public/js/ui.js` | Lobby show/hide, toasts, HP bar, scoreboard, kill feed |
| `public/js/render/` | `world.js` 3D view, `hud.js` overlay, name tags + gun models, `sprites.js` player/pickup shapes |

## Common changes

- **Balance a weapon:** `shared/config.js`
- **New level:** map in `shared/levels.js` + theme in `public/js/themes.js` + floor in `FLOORS` (`public/js/level.js`) + sprite in `render/sprites.js` + button in `index.html`; its obstacle shapes are picked by level name in `buildTerrain` (`shared/terrain.js`)
- **Obstacle looks:** shapes and heights in `buildTerrain` (`shared/terrain.js`), colors in `SHAPE_COLORS` (`public/js/level.js`), rack/crate faces in `drawTerrain` (`public/js/render/world.js`), tree canopies in `canopySprite` (`render/sprites.js`)
- **New sound:** add to `SFX` in `public/js/audio.js`, call `play('name')`
- **New server message:** add a handler in `Room.prototype.handlers` (match) or `Hub.prototype.handlers` (everything else) on the server, or `handlers` in `public/js/net.js` on the client

Website: https://shooty-g7pv.onrender.com/
