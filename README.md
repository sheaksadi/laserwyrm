# Laserwyrm

Snake, set to an electro beat. The snake moves on every 16th note, and lasers
fire on the beat. A laser slices the wyrm where it crosses: the head side lives
on, the rest pops away. A laser through the head costs a heart. Every 8 bars the tempo
rises and more lasers come.

- Arrows / WASD to steer, Space to dash, P to pause, R to restart; music and sound live in
  the menu (or press B and M)
- Score: every beat you survive scores your multiplier, which grows faster
  than your length and rises with each level
- Press start shows a short how-to-play (what to do, and the controls for your
  keyboard, controller or touch) over a warm-up beat; any key, click, tap or A
  starts, and the game's music fades in from it
- Normal mode: walls wrap you to the other side. Each new kind of laser
  (levels 5, 12, 21, … 81) is announced with a notice from the top while play
  goes on: the music builds into a new arrangement and the lasers ease in
  (replays from before keep the old two-bar pause)
- Hardcore (the small square button next to Press start): walls kill, no hearts
  back on level up, no pauses, no easing in; it has its own high scores
- Three hearts, refilled one per level up to three in normal mode (heart drops
  go past it, to five): a laser through the head costs one, walls and biting yourself cost all of
  them; rare heart drops give one back (up to five)
- Fruit grows the snake: apple +1, cookie +2, cherries +3, starry cookie +4 (rare, stays longer, bursts into stars), star +5. A wizard cookie clears every laser and keeps them away for two bars
- Dash: Space lunges four cells ahead, over your own body, for energy. The
  energy bar at the top fills from fruit (stars and cookies the most) and
  slowly by itself
- Power-ups: shield, double points, slow-mo (the world slows, you don't), magnet, ghost. They go
  off as you eat them
- Totem of Undying: very rare, fills your hearts and energy
- Phones play sideways with the board full screen: touch anywhere on the left
  half and a faint stick appears under your thumb; tap the right half to dash
- Every screen plays the same 48 × 26 board, scaled to fit, so runs compare fairly
- Multiplayer rooms (up to six, by code or link), five modes: Survival (last
  snake alive), Score attack (most points on the clock), Sprint (first to a
  target), Slither (no lasers; run into another snake and you crash and turn
  to food) and Domination (eight zones: outnumber the others in one to take
  it; held zones score every beat)
- Settings (☰, the start screen, or the cog on the pause screen), in tabs:
  Sound (all sound, music and effects volume), Controls (controller
  vibration and strength, phone D-pad or stick with a picture of each, and
  every key, rebindable), Display (full screen, the board renderer: SVG or
  an experimental canvas, the FPS meter with 1% low and graph), Account
  (every Account button opens it), Cheats (C: any level, god mode, no
  lasers, items, reset your best; picking a level or item closes Settings
  and plays on; never counted) and About (shortcuts to scores, replays,
  custom games, AI agent; source and license)
- E opens the editor and closes it again; it comes back where it was left
  (its tab, the level, that level's tab)
- When a controller joins, a notice says so; before any click it also asks
  for one (browsers only allow full screen and sound after a click or key);
  after that the controller does everything. While playing, the mouse pointer
  hides until the mouse moves
- Controllers work too: d-pad or left stick to steer, A / Cross or RT / R2 to
  dash, Start or B / Circle to pause, B / Circle to go back, View / Share for custom;
  prompts switch to match
- 100 levels. New lasers arrive as you climb: purple (5, row and column at
  once), blue (12, three wide), white (21, half the warning), green (41,
  follows your head), gold (51, strikes twice); from 61 they mix two tricks,
  and from 81 prism lasers carry three. Runs from before keep the old order
  (blue 11, purple 21, white 31), so their replays play back the same
- Playing goes full screen and stays there. Esc pauses; Esc again, or the
  pause screen's button, leaves full screen. Turn it off in the ☰ menu
- ☰ → Custom, or the Custom button, opens custom play: play your own game
  or a shared one, or open the editor. The editor (workshop) has tabs:
  - Game rules: your game's hearts (start, most, refill), starting length,
    power-up slots and starting level, and its share code (cheats are in
    Settings → Cheats)
  - Undo and redo cover every change (buttons, or Ctrl+Z / Ctrl+Shift+Z)
  - Global: the whole game's feel at once, and music for every level that
    has none of its own. Drag a bar per level (harder or
    easier) and turn the knobs for the climb: overall, start feel, middle
    climb, end feel, lasers, warning time, start and top tempo, level length
  - Levels: every level, 1 to 100 and any you add, in a strip to slide
    through. Pick one to name it, draw its walls (pen, line, box, eraser,
    mirrors, border on/off, full screen, and templates: built in or saved,
    added to or taken from any level of any game), and set its pacing (how hard, tempo, lasers, most at once,
    warning, length, laser kinds), feel (edges wrap or kill, the snipper,
    hearts back, an intro pause, a calm start, points), items (how often each
    turns up here; stock items' rates, life, effect length and stacking; your
    own fruit and power-ups) and music (Strudel code, starting from the stock
    track written out). A level keeps only what you change; the rest follows
    the curve
  - Art: draw 16 × 16 sprites in the game's 16 colours or 32 (pen, eraser,
    fill, picker, mirror) and use them as your items' looks
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
- A run that makes the high scores goes up by itself once you have joined (a
  name, or one made up; no email). The game-over card shows its place
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

The server (`server/`, plain Node plus `pg`; routes in `server/server.mjs`,
handlers in `server/api/`) serves the built game and the API:

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

## AI agents (MCP)

AI agents can make and change a player's custom games over MCP: Claude Code,
Codex, OpenCode, Cursor, Gemini CLI, or anything that speaks Streamable HTTP
(Claude Desktop through `mcp-remote`). In the game: sign in, open ☰ → AI
agent, switch on "Connect AI agents" (the player's games sync to their
account), make a key, and paste the setup shown for the agent. For example:

```bash
claude mcp add --transport http laserwyrm https://<host>/mcp --header "Authorization: Bearer lwa_…"
```

The server answers MCP at `POST /mcp` (stateless, JSON replies) with tools
to list, create, rename and delete games; read and change levels (pacing,
feel, items), draw walls (as a 48 × 26 grid of `#`, or built-in templates),
set the global curve and game rules, write Strudel music for the game or a
level (main or background track), make and tweak items, and get a share
code. Agent keys (`lwa_…`) open only these tools, for that player's custom
games: no playing, no scores, no other accounts. Everything is cleaned by
the same code as in the game (`src/designCore.ts`). Changes reach the open
game within a few seconds, and can be undone there.

| Method | Path | What |
|---|---|---|
| POST | `/mcp` | MCP (agent key) |
| GET | `/api/me/library` | the player's synced games |
| PUT / DELETE | `/api/me/library/:id` | sync one game (newest wins) |
| GET / POST | `/api/me/agent-keys` | list or make agent keys |
| DELETE | `/api/me/agent-keys/:id` | revoke one |

## Develop

```bash
npm install
npm run server  # API on :8787 (PGlite in .data/pglite; set DATABASE_URL for Postgres)
npm run dev     # the game on :5173, with /api proxied to :8787
npm run build   # type check and production build into dist/
npm start       # production: game and API on $PORT (8080)
```

All sound is synthesised with Web Audio (`src/audio.ts`), which is also the
game clock. Game logic lives in `src/game/`, the app shell in `src/App.vue` and
`src/app/`, the board in `src/components/Board.vue`. `CLAUDE.md` maps the code
for anyone (or any agent) working on it.

Deployed with the `Dockerfile`: a Vite build served, with the API, by the Node
server on port 8080. The hosting platform provides Postgres as `DATABASE_URL`.

## License

Laserwyrm is free software under the GNU Affero General Public License,
version 3 or later (see `LICENSE`). Level music runs on
[Strudel](https://strudel.cc), which is AGPL-3.0 as well. Anyone who plays a
hosted copy can get the source: the game links to it under ☰ → Settings.
