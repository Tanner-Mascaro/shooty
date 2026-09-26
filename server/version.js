// The game's version, from package.json. Shown in the lobby and the server log; bump it with
// `npm version patch` (fixes), `minor` (new features) or `major` before deploying.
import fs from 'node:fs';

export const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
