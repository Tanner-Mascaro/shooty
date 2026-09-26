# AGENTS

This repo is a small multiplayer browser game. It has no build step; the browser loads ES modules directly.

## Run it

- `npm install`
- `npm start` — serves on port 3000
- `npm run dev` — same as start, but restarts on file changes
- `npm run bots` — starts the app with a server-side bot as the second player

Port override examples:

- macOS/Linux: `PORT=4000 npm start`
- PowerShell: `$env:PORT=4000; npm start`
- CMD: `set PORT=4000&& npm start`

## Project shape

- `server.js` — creates the HTTP server, WebSocket server, and game tick loop
- `server/game.js` — lobby, match state, message handling, respawns, pickups, pits
- `server/combat.js` — authoritative hit detection for rifle, shotgun, melee, etc.
- `server/bot.js` — solo-testing bot behavior
- `shared/config.js` — shared balance values used by both server and browser
- `shared/levels.js` and `shared/terrain.js` — map data and collision helpers
- `public/js/*.js` — client-side game logic, networking, render loop, and input
- `public/js/render/*.js` — 3D world rendering and HUD

## Working conventions

- Keep gameplay balance in `shared/config.js` instead of duplicating numbers in client code.
- If you change a server message, update both the server-side handler and the client-side `public/js/net.js` handler.
- The project is intentionally simple: no bundler, no transpile step, no modern framework.
- For a new level, expect edits in the map data, level/theme setup, and the page UI list.

## Good first checks

- If a gameplay change feels wrong, start in `shared/config.js`.
- If a connection or state issue appears, inspect `server.js`, `server/game.js`, and `public/js/net.js`.
- If a visual or sound change is needed, check the relevant files under `public/js/` and `public/js/render/`.

## Notes for AI agents

- Prefer the smallest change that matches the existing pattern.
- Match the repo’s plain JavaScript style and avoid adding heavy tooling unless clearly needed.
- Treat the server as authoritative for combat rules and player state.
