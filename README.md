# pistols and potion

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

## Weapons and loot

- **Two guns plus the blade.** Everyone spawns with a pistol. Keys 1 and 2 pick your guns, 3 the blade, Q swaps back to the last one.
- **Nothing is unlimited.** Every gun's ammo runs out, spares are capped at three mags, and a gun you've emptied completely is gone. Only the blade needs no ammo.
- **Ammo crates:** ten small crates at random spots each match. Walk over one for a mag for each gun you carry (skipped if you're full). They come back after 12s.
- **Gun pads** roll a random rifle, sniper, shotgun or SMG each time they respawn. Walk up and press **E** to take it. With both slots full, the gun in your hand is swapped out and left in a box at your feet. Health pads are still taken by walking over them.
- **Loot boxes:** when someone dies, their picked-up guns go in a box at the body with the ammo left in them. Press **E** to loot: ammo for guns you carry comes out first, then one gun per press. Boxes vanish after 30s.
- **Reloading:** R, or automatically when the mag is empty. The server counts rounds too.

- **Sliding:** Shift while running drops you low with a burst of speed and little friction; jump out of it to keep the speed, or hold it as you land from a bhop. Sliding players are shorter targets.

Mags, reload times, ammo, crates, pad guns, slot count and slide tuning are in `shared/config.js`.

## Settings

The ⚙ button (top right, or P in a match) sets the frame rate limit, FPS counter, fullscreen, master and background volume, mouse sensitivity, scope mode (click to toggle or hold to aim) and every key binding. Settings are saved in the browser and on your profile, so signing in on another device brings them along.

## Chat and voice

- **Text chat:** everyone in the room. In the lobby it's a card; in a match press **Enter** to type, Enter to send, Esc to cancel, and messages fade after a few seconds. Up to 140 characters, 5 messages per 5 seconds; the server log records them.
- **Voice chat:** push to talk on **V** by default (or open mic / off in settings). Audio goes straight between browsers (WebRTC); the server only passes the connection setup along. The browser asks for the mic the first time you talk. In a teams match only your teammates hear you. Names light up while someone talks, and the 🔈 next to a name in the lobby mutes them.
- Voice needs https (fine on Render) or localhost; over plain http on another device the mic is blocked. It uses public STUN servers only, so on some strict networks (some school/office Wi-Fi, carrier networks) two players may not be able to connect; adding a TURN server to `ICE` in `public/js/voice.js` fixes that.

## Rooms, modes and friends

- **Rooms:** every game is a room with a short code, and the address bar is its invite link (`/?room=ABCDE`). **Quick play** puts you in any public room with space; **New private room** makes one only people with the link (or an invite) can join. Up to 8 players; you can join a match in progress.
- **Free-for-all:** first to 10 kills wins. **Teams:** red vs blue, first team to 20 kills; bullets pass through teammates. Pick a team in the lobby, or the game splits everyone if one side is empty.
- **Gun Game:** every kill hands you the next gun on a 14-gun ladder (pistol up to sniper); a kill with the final blade wins. Getting stabbed knocks you back one gun. No gun pickups or potions; ammo crates still work.
- **Battle Royale:** one life each, up to 16 players: a room with bots fills the extra seats with more bots when the match starts. Everyone starts with a pistol and loots crates and the fallen while a storm closes in over four stages in under two minutes (hurting more each stage); the minimap shows the safe circle and where it's heading. Last one standing wins. People who join mid-match spectate.
- **Dying:** you watch your killer from behind for 3 seconds before respawning (click to switch players when you're out of a Battle Royale). Plague still turns you into a monster on the spot.
- **Kill streaks:** callouts for multi-kills (double, triple, …) and streaks (killing spree at 3, rampage at 5, up to legendary at 15), announced in the kill feed, plus a note when someone ends a streak of 3 or more.
- **Friends** (accounts only): add someone by username; once they accept you see whether they're online and which room they're in, and can **Invite** them (they get a popup with a Join button) or **Join** them.
- The match starts once everyone in the room clicks "I'm Here" (2+ players). It ends early if too few are left (or a team is empty).

Win scores, room size, `RESPAWN_MS`, `MULTI_KILL_MS`, `GUN_GAME_LADDER` and the storm's `ROYALE_ZONE` stages are in `shared/config.js`.

## Plague

Choose **PLAGUE** in the lobby and ready up with at least two players (bots work too). Under **STARTING INFECTION**, choose **1 RANDOM PLAYER / BOT** to pick exactly one starting monster each round, or **CHOOSE PLAYERS** to set each player and bot to **Infected** or **Healthy** in the player list. Manual setup requires at least one of each. Any player can change the setup before the round; changes reset everyone's ready status.

- A plague player's kill infects the victim: they respawn as a monster and hunt the remaining healthy players.
- Healthy players use normal weapons and have 100 health. Infected players and bots have 300 health, move 2 times as fast, and get a double jump (release and press jump again in the air). Infected spawn and respawn at full health, and health pickups heal up to their 300-health cap.
- Press **Left Shift** to dash in your movement direction, or forward when standing still. The burst lasts 0.2 seconds with a 2-second cooldown, works in the air, and stops at walls. The HUD shows when the dash is ready; its key can be changed in Settings.
- Infected players only use claws: the main shoot button (left click) attacks, and holding it repeats attacks, with no on-screen claw sprite. Each hit deals 50 damage, so a full-health survivor takes two hits. Claws have no headshot or backstab bonus. Infected players cannot equip, fire, reload, or pick up guns, loot weapon boxes, or use grenades; health pickups still work.
- Infected bots chase survivors at the increased speed, dash to close the distance, and attack with claws. Teammates cannot hurt each other. Killing a monster does not cure it; pit deaths do not infect healthy players.
- The plague wins when nobody is healthy. The healthy team wins if anyone survives for three minutes. The HUD shows your side, survivors and time remaining.
- Players and bots joining a round in progress join the plague. If the last monster leaves, the healthy team wins; if the last healthy player leaves, the plague wins.
- Random setup picks again each rematch. Manual setup remembers your starting roles, independently of infections during a round. New arrivals in the lobby default to Healthy and can be reassigned. Your selected character returns in the lobby and whenever you are healthy.

Change `PLAGUE_DURATION`, `PLAGUE_SPEED_MULTIPLIER`, `PLAGUE_MAX_HP`, `PLAGUE_JUMPS`, `PLAGUE_DASH_SPEED`, `PLAGUE_DASH_DURATION`, `PLAGUE_DASH_COOLDOWN`, or `WEAPONS.claws` in `shared/config.js` to tune the mode.

Run `npm test` for server checks covering infection, friendly fire, round endings, late joins, rematches, and the original game modes.

## Bots

Any room can be filled out with server-side bots using the lobby's **+ BOT / − BOT** buttons, in free-for-all or teams. Pick **Easy / Medium / Hard** first; each bot also gets a random character. Bots are always ready, so a solo player can just add a few and click "I'm Here". They only take empty seats: when a person joins a full room, a bot leaves to make space. They leave when the last person does. Matches with bots count toward saved stats.

`npm run bots` (or `npm start -- --bots` without auto-restart) also starts every new room with one bot, for local testing.

- **Roams** between random spots it can walk to in a straight line, avoiding walls and pits
- **Shoots** the rifle at the nearest enemy it can see within 25 units, after a short reaction delay and with some aim wobble
- Fires through the same `shoot` handler as a real player, so hits, kills, tracers, sounds and scoring all work normally

Speed, sight range, reaction time, fire rate and aim error per difficulty are in `BOT_LEVELS` at the top of `server/bot.js`.

## Spells

- **Stone Wall (Z)** and **Earth Ramp (X):** hold the key to see where it'll land (green if it fits, red if not), let go to conjure it. They snap to a half-square grid facing the way you look. Walls block movement and bullets; ramps are slopes you run up for height. Both cost mana (the purple bar under your health, refilling over time), can be shot or blown down, and crumble after 30 seconds. They only go on open flat ground with nobody standing there.
- **Stored spells (4, 5, 6):** spell scrolls lie around every map. Walk over one to store its spell (up to three): **Heal** (+50 hp), **Haste** (move faster for 5 seconds) or **Ward** (soaks up 60 damage for 8 seconds). The spell bar above your speed shows what you're carrying. Bots pick them up too and use them when it makes sense.
- The server checks every cast. A room builds on its own copy of the map, so builds never leak between rooms, and they're cleared for each new match. Costs, health, lifetimes and effects are in `shared/config.js`; wall and ramp shapes are in `shared/spells.js`. Keys can be rebound in Settings.

## Maps

Seven maps, all in the lobby vote (`FEATURED_LEVELS` in `shared/levels.js`), each 80×80 and point-symmetric so both sides are fair:

- **Witch Swamp:** bog, trees and enterable cottages.
- **Gothic Castle:** a moonlit keep with halls and climbable towers.
- **Brimstone Coven:** charred cottages among volcanoes, with lava rivers to cross.
- **Frost Hollow:** snowed-in cottages, ice spires and frozen ponds under a violet sky.
- **Pumpkin Hollow:** a harvest village on a cobbled lane, with carts, pumpkin patches (some are lit jack-o'-lanterns) and a big orange moon.
- **Alchemist's Lab:** aisles of glowing potion shelves, bubbling brew vats and a ring of shelves at the heart.
- **Hexed Manor:** half a violet-papered manor and half the yellow Backrooms, under a ceiling (`theme.ceiling` in `public/js/themes.js`; which half a spot is in comes from `inBackrooms` in `shared/levels.js`).

Each map is an ASCII grid in `shared/levels.js` (only the top half is written; it's mirrored), with its look in `public/js/themes.js`, `public/js/level.js` and `public/js/render/gl/`. `npm test` checks every map is symmetric, fully reachable, and has spawns, pickups and hardpoint hills. The world is drawn with Three.js from the shared heightmap.

## Seeing players

Every player has a glowing outline: white in free-for-all, red / blue in teams.

## Profiles, accounts and leaderboard

Players set a name in the lobby and get saved stats (kills, deaths, K/D, wins, losses) plus their leaderboard rank. Matches with bots count. Profiles also keep each player's settings.

- **Guests:** no sign-up needed. The browser keeps a random secret key that identifies the profile, so clearing site data or switching browsers starts a new one.
- **Accounts:** "Create account" puts a username + password on your current profile (stats kept). "Sign in" on any other device switches that browser to your account. Passwords are hashed with scrypt; 5 wrong tries per minute locks out that IP for the rest of the minute. There's no password reset yet (no email on file).
- **Leaderboard:** top 10 in the lobby, ranked by wins, then kills, then fewest deaths. Only players with a finished match appear.

Locally, profiles are saved to `data/profiles.json` (git-ignored). On Render that file is wiped on every redeploy or restart, so use a free Postgres database instead:

1. Create a free database at [neon.tech](https://neon.tech) (or Supabase) and copy its connection string (`postgresql://...`)
2. In Render: your service → **Environment** → add `DATABASE_URL` with that string
3. Redeploy. The log should say `Profiles: Postgres`; tables are created (and upgraded) automatically

## Versions

The version in `package.json` shows in the lobby's bottom-left corner and the server log. Bump it before deploying: `npm version patch` for fixes, `npm version minor` for new features, `npm version major` for big changes (each makes a commit and a git tag).

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
| `public/js/chat.js`, `voice.js` | Text chat box; WebRTC voice chat (connections, push to talk, who's talking, muting) |
| `public/js/settings.js` | Settings panel: FPS limit, sound, sensitivity, scope mode, key bindings, fullscreen (saved in the browser and on the profile) |
| `public/js/level.js`, `themes.js` | Level loading, per-level colors/sounds/WebGL materials |
| `public/js/audio.js` | Synthesized sound effects |
| `public/js/particles.js` | Blood, sparks, embers |
| `public/js/ui.js` | Lobby show/hide, toasts, HP bar, scoreboard, kill feed |
| `public/js/render/` | WebGL world (`gl/`), HUD overlay, gun viewmodel, sprites |
| `public/vendor/three.module.js` | Three.js ESM (import map in `index.html`) |

## Common changes

- **Balance a weapon:** `shared/config.js`
- **New level:** map in `shared/levels.js` + theme in `public/js/themes.js` (include `mat` for WebGL) + floor preview colors in `FLOORS` (`public/js/level.js`) + sprite in `render/sprites.js` + button in `index.html`; obstacle shapes come from level name in `buildTerrain` (`shared/terrain.js`)
- **Obstacle looks:** shapes and heights in `buildTerrain` (`shared/terrain.js`); WebGL meshes/textures in `public/js/render/gl/terrainMesh.js` and `textures.js`
- **New sound:** add to `SFX` in `public/js/audio.js`, call `play('name')`
- **New server message:** add a handler in `Room.prototype.handlers` (match) or `Hub.prototype.handlers` (everything else) on the server, or `handlers` in `public/js/net.js` on the client

Website: https://shooty-g7pv.onrender.com/
