# Laserwyrm

Snake, set to an electro beat. The snake moves on every 16th note, and lasers
fire on the beat. A laser slices the wyrm where it crosses: the head side lives
on, the rest pops away. A laser through the head costs a heart. Every 8 bars the tempo
rises and more lasers come.

- Arrows / WASD to steer, Space to use a pill, P to pause, R to restart; music and sound live in
  the menu (or press B and M)
- Score: every beat you survive scores your multiplier, which grows faster
  than your length and rises with each level
- Press start shows a short how-to-play (what to do, and the controls for your
  keyboard, controller or touch) over a warm-up beat; any key, click, tap or A
  starts, and the game's music fades in from it
- Normal mode: walls wrap you to the other side. Each new kind of laser
  (levels 11, 21, … 81) pauses play for two bars to introduce it: the music
  slides to a stop and comes back in a new arrangement, then lasers ease in
- Hardcore (the small square button next to Press start): walls kill, no hearts
  back on level up, no pauses, no easing in; it has its own high scores
- Three hearts, refilled one per level up to three in normal mode (heart drops
  go past it, to five): a laser through the head costs one, walls and biting yourself cost all of
  them; rare heart drops give one back (up to five)
- Fruit grows the snake: apple +1, cherries +3, star +5
- Power-ups: shield, double points, slow-mo, dash, magnet, ghost. Hold up to two
  and press Space (or tap the slots) to use the oldest
- Totem of Undying: very rare, cheats death once
- Phones play sideways with the board full screen: touch anywhere on the left
  half and a faint stick appears under your thumb; tap the right half to use a
  power-up
- Every screen plays the same 48 × 26 board, scaled to fit, so runs compare fairly
- ☰ → Settings: music and effects volume, controller vibration (on/off,
  strength; it rumbles harder for bigger cuts, hits and game over), full screen
- Controllers work too: d-pad or left stick to steer, A / Cross or RT / R2 for
  power-ups, Start or B / Circle to pause, B / Circle to go back, View / Share for custom;
  prompts switch to match
- 100 levels. New lasers arrive as you climb: blue (11, three wide), purple
  (21, row and column at once), white (31, half the warning), green (41,
  follows your head), gold (51, strikes twice); from 61 they mix two tricks,
  and from 81 prism lasers carry three
- Playing goes full screen and stays there. Esc pauses; Esc again, or the
  pause screen's button, leaves full screen. Turn it off in the ☰ menu
- C (or ☰ → Custom, or the Custom button) opens custom play: play your own game
  or a shared one, open the editor, or cheats. The editor (workshop) has tabs:
  - Cheats: pick any of the 100 levels, god mode, no lasers, give yourself
    items, reset your best score. Runs with cheats never set a best
  - Global: the whole game's feel at once. Drag a bar per level (harder or
    easier) and turn the knobs for the climb: overall, start feel, middle
    climb, end feel, lasers, warning time, start and top tempo, level length
  - Levels: every level, 1 to 100 and any you add, in a strip to slide
    through. Pick one to name it, draw its walls (mirror, border, full
    screen), and set its pacing (how hard, tempo, lasers, most at once,
    warning, length, laser kinds), feel (edges wrap or kill, the snipper,
    hearts back, an intro pause, a calm start, points), items (how often each
    turns up here; stock items' rates, life, effect length and stacking; your
    own fruit and power-ups) and music (Strudel code, starting from the stock
    track written out). A level keeps only what you change; the rest follows
    the curve
- The custom screen lists your games (as many as you like: play, edit, rename,
  delete, + for a new one). Share any of them for a short code (K7QM2X), a
  link (`#/d/K7QM2X`) and a QR code; anyone can play it from the code box or
  the link. No sign-in needed for that (it is unlisted)
- It also lists designs other players published: browse newest,
  most played or most liked, search, play one (it has its own board), like it,
  or copy it into your game. Signed in, share yours. Normal play is always the
  stock game; custom play is yours or a shared one, and the pause screen offers
  the editor and a way back to normal
- Your design stays on the device and travels as one share code (`LW2-…`).
  Runs on a changed game count as custom (no best, not on the main boards),
  and their replays carry the design so they play back the same
- New best scores can be signed with a name and optional email (saved in the
  browser for now)
- The snipper hunts your middle: bite it to grow +3

## Games, players, high scores and replays

Every finished game is saved with a code like `BORK#4821`: a silly four-letter
word and four digits. The code shows on the game-over screen and on the board;
click it to copy, or copy a link (`#/game/BORK-4821`) that opens the replay.

☰ → Replays finds any game by code or a player's name, and lists your games:
every game played on this device, plus (signed in) every game on your account.
Any game can be saved offline, replay and all, in the browser.

☰ → Account: claim a name (a taken one gets free suggestions) and the server
hands back a login code like `PDKM-DC3B-LN9P-Z4WB`. That code is the account:
it signs you in on any device. Making the high scores and typing a name there
claims it too. Board entries carry the player's name and their game's code.

A replay is the run's seed, grid size and every input, filed by game step.
The engine is deterministic, so a replay plays the run again exactly; it is a
few KB. The player has play/pause, 0.5×–16× speed, a seek bar and ±5 s jumps
(← →, Space, Esc to go back); up to 2× it plays with music and sound. The seek
bar marks power-ups, cuts, hearts lost and gained, level ups and the totem,
with filters.

The server (`server/server.mjs`, plain Node plus `pg`) serves the built game
and the API:

| Method | Path | |
|---|---|---|
| POST | `/api/games` | save a finished game → `{ code }` |
| GET | `/api/games/:code` | one game with its replay (`BORK-4821`) |
| GET | `/api/games?q=` | search by game code or player name |
| GET | `/api/me/games` | the signed-in player's games |
| POST | `/api/users` | claim a name → `{ name, code }`, or 409 with suggestions |
| POST | `/api/login` | `{ code }` → `{ name }` |
| GET | `/api/me` | the signed-in player |
| GET | `/api/scores?mode=normal&limit=50` | a board (normal or hardcore), best first (no emails) |
| GET | `/api/scores/:id` | one board entry with its replay |
| POST | `/api/scores` | put one of your games on the board: `{ game, email? }` |
| GET | `/api/designs?sort=new\|played\|liked&q=&mine=1` | shared designs |
| GET | `/api/designs/:slug` | one design, with its own board |
| POST | `/api/designs` | share: `{ name, about, design, listed? }` → `{ slug }`; listed (on Explore) needs sign-in, `listed: false` makes an unlisted code and link |
| POST | `/api/designs/:slug/like` | like or unlike (signed in) |
| POST | `/api/designs/:slug/play` | count a play |
| DELETE | `/api/designs/:slug` | take down one of yours |
| GET | `/api/health` | `{ ok, store }` |

Signed-in requests send `Authorization: Bearer <login code>`; the server keeps
only a hash of it. Data lives in Postgres from `DATABASE_URL`, with tables
made on start. Without it the server runs PGlite (Postgres in-process, kept in
`.data/pglite`) for local work. Input is checked and rate-limited per address; scores
are not yet re-simulated on the server, so a determined cheater could post one.

## Develop

```bash
npm install
npm run server  # API on :8787 (PGlite in .data/pglite; set DATABASE_URL for Postgres)
npm run dev     # the game on :5173, with /api proxied to :8787
npm run build   # type check and production build into dist/
npm start       # production: game and API on $PORT (8080)
```

All sound is synthesised with Web Audio (`src/audio.ts`), which is also the
game clock. Game logic lives in `src/game.ts`, the board in
`src/components/Board.vue`.

Deployed with the `Dockerfile`: a Vite build served, with the API, by the Node
server on port 8080. The hosting platform provides Postgres as `DATABASE_URL`.

## License

Laserwyrm is free software under the GNU Affero General Public License,
version 3 or later (see `LICENSE`). Level music runs on
[Strudel](https://strudel.cc), which is AGPL-3.0 as well. Anyone who plays a
hosted copy can get the source: the game links to it under ☰ → Settings.
