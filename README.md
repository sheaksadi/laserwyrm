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
- C opens the cheat menu (also in the ☰ menu): pick any of the 100 levels, god mode, no
  lasers, give yourself items. Runs with cheats never set a best
- New best scores can be signed with a name and optional email (saved in the
  browser for now)
- The snipper hunts your middle: bite it to grow +3

## Develop

```bash
npm install
npm run dev
npm run build   # type check and production build into dist/
```

All sound is synthesised with Web Audio (`src/audio.ts`), which is also the
game clock. Game logic lives in `src/game.ts`, the board in
`src/components/Board.vue`.

Deployed with the `Dockerfile`: a Vite build served by nginx on port 8080.
