# Laserwyrm

Snake set to an electro beat (Vue 3 + TypeScript + Vite, a plain Node server,
Postgres). The snake moves on 16th notes, lasers strike on the beat, and every
run is a deterministic replay. README.md describes the game and its API for
players and operators. This file is for working on the code.

## Commands

```bash
npm run server   # API on :8787 (PGlite in .data/pglite; DATABASE_URL for Postgres)
npm run dev      # the game on :5173; /api, /mcp and the /mp websocket proxy to :8787
npm run build    # vue-tsc type check + production build into dist/ (the only "test" gate)
npm start        # production: game and API from one server on $PORT (8080)
```

- The API server does not reload. Restart it after editing anything under `server/`.
- Vite sometimes keeps serving stale modules after quick edits. Touch the file, or
  `curl localhost:5173/src/<file>`, before concluding a change "did nothing".
- There is no unit-test suite. Check work with `npm run build`, then drive the game
  in headless Chromium (`/usr/bin/chromium` + `playwright-core`). In dev builds,
  `window.__snake` is the game module (see `src/main.ts`): `state`, `play()`,
  `startReplay(run)`, `replayTo(step)` and the rest.

## Layout

```
src/
  main.ts            mounts App; exposes window.__snake in dev
  App.vue            the shell: board, HUD, and one panel/card at a time
  app/               the shell's logic
    ui.ts            which panel is open (`ui`), the actions that open them, `status`
    route.ts         hash pages (#/scores, #/replays, #/watch/…) and share/room links
    input.ts         keyboard, swipes, controller buttons (what each does depends on what is open)
    scoreEntry.ts    saving every finished game; posting one to the high scores
    padReady.ts      "controller connected" notice; the first click with a pad here goes full screen (needs a real gesture)
  game/              the engine (see "The engine" below); import it only as './game'
  audio.ts           Web Audio synth AND the game clock (`conductor`, `now()`, step queue)
  music.ts           Strudel level music on top of the conductor
  designCore.ts      a game design as data: shape, stock values, cleaning. Shared with the server
  design.ts          the editable design in the browser: library of games, undo, sharing
  multiplayer.ts     rooms over the /mp websocket; game side is game/match.ts
  replayPlayer.ts    watching a recorded run (speed, seek)
  account.ts api.ts  the player on this device; the HTTP client for server/
  sync.ts            syncing custom games to the account (for AI agents over MCP)
  looks.ts sprites.ts gamepad.ts controls.ts fullscreen.ts menuNav.ts
  components/        Vue components (groups below)
  styles/cards.css   the start/pause/game-over cards and overlays (see "Styles")
  style.css          global: palette variables, fonts, base elements
server/
  server.mjs         routing only (the route table is the source of truth for the API)
  api/               handlers by group: players, games, scores, library (+ agent keys, MCP), designs
                     auth.mjs (who is asking), rows.mjs (row → JSON), index.mjs (merges them)
  db.mjs             schema + Postgres/PGlite setup
  checks.mjs         codes, names, and cleaning replays/designs/emails from clients
  http.mjs           JSON replies, body reading, HttpError, rate limits, static files from dist/
  rooms.mjs          multiplayer rooms (WebSocket)
  mcp.mjs            MCP tools that let AI agents edit a player's custom games
```

Components, by area:
- **Shell and play:** Board (SVG board), HudBar, HeldPills, PlayNotices, PowerIcon, Hat,
  Mascot, Briefing, StartCard, PauseCard, GameOverCard, GameCode, PadGlyph
- **Phone controls:** DPad, Joystick, ActionButton
- **Workshop (custom game editor), opened as CheatMenu:** RulesPanel, GlobalPanel,
  LevelsPanel, LevelRules, LevelItems, LevelMusic, MusicPanel, WallEditor, SpritePanel,
  AutoSlider
- **Custom games:** CustomPanel, ExplorePanel
- **Scores and replays:** Leaderboard, ReplaysPanel, ReplayViewer
- **Account:** AccountPanel, NameEdit, LookPicker, AgentPanel, SettingsPanel
- **Multiplayer:** MultiplayerPanel, MpBar, MpResults

## The engine (`src/game/`)

`index.ts` is the public surface: everything outside imports from `'./game'`, never
from the files inside. It re-exports a fixed list and calls `startEngine()` once,
after every module has loaded. To make something public, add it to that list.

| file | job |
|---|---|
| catalog | types, stock tables (lasers, tiers, power-ups, fruit, colours), tuning numbers |
| rng | the seeded generator: `random`, `rand`, `pick`, `reseed` |
| curve | how a level plays, from the design only (tempo, lasers, warning, item rates) |
| state | the reactive `state` the view draws, `cheats`, `replay`, `match`, `demo`, the `run` bookkeeping, `onFeel`/`onMark` hooks, game-clock timers |
| engine | `reset`, `onStep`/`onBeat`/`onBar`, `tick`, the frame loop, `startEngine` |
| levels | rules that depend on the run (edges, healing, intros), `multiplier`, entering a level |
| lasers / hits / snipper / items | their mechanics (cuts and death are in hits) |
| controls | play, pause, turn, use item, mode, cheats: live input is recorded here |
| replay / match / demo | playback, a multiplayer match, the start screen's self-playing backdrop |

The modules import each other in a cycle. That is fine as long as no module *calls*
another module's export at the top level (only inside functions). `state.ts` calls
`tempoFor` at load, so `curve.ts` must never import `state.ts`.

### Rules that keep replays working

A replay is only seed + grid + inputs (+ design and rules revision). Old replays,
saved on the server, must play back exactly. So:
- All chance in play comes from `rng.ts`. Never call `Math.random()` in game logic
  (the demo pilot and new seeds are the only exceptions).
- Time that matters is counted in steps (16th notes), never in ms. Timers via
  `later()` are only for visuals (popups, bolts, banners).
- Inputs are filed against `run.stepsDone` in `controls.ts`. Replays feed them back in
  `replay.ts`. A new kind of input needs a code in `ReplayEvent` and in
  `checkReplay` (`server/checks.mjs`).
- Changing what happens in play (item tables, laser rolls, the order of `random()`
  calls) changes old runs. Gate it behind a new rules revision: bump `ITEMS_REV`
  in `catalog.ts` and branch on `revision.rev`, as revisions 2–4 do. Laser tiers
  differ by revision (4 moved purple to level 5): read them with `laserTraits()`
  and `laserTiers()`, never a fixed table, so replays and notices follow the run.
- To check a refactor: play recorded runs with `startReplay` + `replayTo` before
  and after, and compare `state` at intervals. They must match exactly.

## Designs (custom games)

A design is data (`designCore.ts`): global curve, rules, up to 150 level edits, items,
sprites, music. A level stores only what it changes. Everything else follows the curve
(`game/curve.ts`). The server imports `designCore.ts` directly
(`node --experimental-strip-types`). Keep it plain TypeScript that strips cleanly
(no enums, no parameter properties), and import only types from the browser code.
The Dockerfile copies `server/` and `src/designCore.ts` only. If the server starts
importing anything else from `src/`, add it there.

## Server

- Handlers return a body, or `{ status, body }`, and throw `HttpError(status, msg, extra)`.
  Add a route to `server.mjs`'s table and its handler to the right `api/` file.
- The schema in `db.mjs` runs on every start. Never edit existing statements: add
  `ALTER … ADD COLUMN IF NOT EXISTS` / `CREATE … IF NOT EXISTS` at the end.
- Rate limits are per address and kind (`limit(ip, kind, max)` per minute).
- Login codes and agent keys are stored hashed only.

## Styles and UI

- Components use `<style scoped>`. Scoped `@keyframes` are per component, so a
  component that animates needs its own keyframes.
- `styles/cards.css` holds the cards and overlays. App, StartCard, PauseCard and
  GameOverCard each include it with `<style scoped src>`, which scopes it to each
  one. Rule order matters there: several rules have the same weight, and the later
  one wins (e.g. `.card h1` beats `.card-start h1`; the `.card` media rules beat
  the card-specific padding on short screens). Add rules where they belong in that order.
- A child component's root element also gets the parent's scoped rules. That is how
  App's `.overlay` and `.card` rules reach panel roots like MpResults.
- New menus and cards follow the start card's look: rose border with a mint ring,
  16px rounded corners, 10–12px rounded buttons and fields, one even gap. They
  transition quickly (about 0.18s in, 0.12s out) from slightly smaller and
  transparent, via the `menu` Transition in App.vue. Never use stepped pop-ins.
- One panel at a time: add a flag to `ui` in `app/ui.ts`, a branch to App.vue's
  `<Transition name="menu">` chain (order = priority), and its Escape handling in
  `app/input.ts` (keyboard) and `padHandlers.cancel` (controller B).

## Code style

No semicolons, single quotes, 2 spaces, long lines are fine. Every module opens
with a doc comment saying what it is for. Exports and non-obvious functions get a
one-line `/** … */` written in plain English, about behaviour rather than
mechanics. Sections inside a file use `/* ─── Name ─── */` dividers. Match the
surrounding code's voice.
