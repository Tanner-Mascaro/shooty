# shooty

Two-player networked 3D arena shooter. No build step: the browser loads the ES modules directly.

```
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts the server when files change
PORT=4000 npm start
```

For remote play run `ngrok http 3000` and share the URL.

## Layout

| Path | What's in it |
|---|---|
| `server.js` | Entry point: HTTP + WebSocket wiring |
| `server/game.js` | Lobby, match state, respawns, pickups, pits, message handlers |
| `server/combat.js` | Hitscan, shotgun pellets, melee (authoritative) |
| `server/static.js` | Serves `public/` and `shared/` |
| `shared/config.js` | Weapons, ammo, HP, tick rate (used by server **and** browser) |
| `shared/levels.js` | Map layouts |
| `shared/terrain.js` | Heightmap + collision helpers |
| `public/index.html`, `style.css` | Page + lobby |
| `public/js/main.js` | Client entry + frame loop |
| `public/js/state.js` | All mutable client state (`S`) |
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
