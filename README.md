# Laserwyrm

Snake, set to an electro beat. The snake moves on every 16th note, and lasers
fire on the beat. A laser slices the wyrm where it crosses: the head side lives
on, the rest pops away. A laser through the head costs a heart. Every 8 bars the tempo
rises and more lasers come.

- Arrows / WASD to steer, Space to use a pill, P to pause, R to restart; music and sound live in
  the menu (or press B and M)
- Score: every beat you survive scores your multiplier, which grows faster
  than your length and rises with each level
- Three hearts: a laser through the head costs one, walls and biting yourself cost all of
  them; rare heart drops give one back (up to five)
- Fruit grows the snake: apple +1, cherries +3, star +5
- Power-ups: shield, double points, slow-mo, dash, magnet, ghost. Hold up to two
  and press Space (or tap the slots) to use the oldest
- Totem of Undying: very rare, cheats death once
- Controllers work too: d-pad or left stick to steer, A / Cross or RT / R2 for
  power-ups, Start to pause, View / Share for cheats; prompts switch to match
- 100 levels. New lasers arrive as you climb: blue (11, three wide), purple
  (21, row and column at once), white (31, half the warning), green (41,
  follows your head), gold (51, strikes twice); from 61 they mix two tricks,
  and from 81 prism lasers carry three
- Playing goes full screen and stays there. Esc pauses; Esc again, or the
  pause screen's button, leaves full screen. Turn it off in the ☰ menu
- C opens the cheat menu (also in the ☰ menu): pick any of the 100 levels, god mode, no
  lasers, give yourself items. Runs with cheats never set a best
- New best scores can be signed with a name and optional email (saved in the
  browser for now)
- The snipper hunts your middle: bite it to grow +3

## High scores and replays

Runs that make the board can be signed with a name (and an optional email,
never shown). Each entry keeps a replay: the run's random seed, grid size and
every input, filed by game step. The engine is deterministic, so feeding a
replay back through it plays the run again exactly. A replay is a few KB.
The board's Watch button opens a player with play/pause, 0.5×–16× speed, a
seek bar, and ±5 s jumps (← →, Space, Esc to go back).

The server (`server/server.mjs`, plain Node plus `pg`) serves the built game
and the API:

| Method | Path | |
|---|---|---|
| GET | `/api/scores?limit=50` | the board, best first (no emails) |
| GET | `/api/scores/:id` | one entry with its replay |
| POST | `/api/scores` | `{ name, email?, score, level, replay }` |
| GET | `/api/health` | `{ ok, store }` |

Scores live in Postgres, from `DATABASE_URL`; the table is created on start.
Without `DATABASE_URL` the server keeps scores in memory (fine for local work).
Submissions are checked for shape and rate-limited per address; scores are
not yet re-simulated on the server, so a determined cheater could post one.

## Develop

```bash
npm install
npm run server  # score API on :8787 (add DATABASE_URL=postgres://... to use Postgres)
npm run dev     # the game on :5173, with /api proxied to :8787
npm run build   # type check and production build into dist/
npm start       # production: game and API on $PORT (8080)
```

All sound is synthesised with Web Audio (`src/audio.ts`), which is also the
game clock. Game logic lives in `src/game.ts`, the board in
`src/components/Board.vue`.

Deployed with the `Dockerfile`: a Vite build served, with the API, by the Node
server on port 8080. The hosting platform provides Postgres as `DATABASE_URL`.
