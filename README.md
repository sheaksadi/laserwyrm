# Laserwyrm

Snake, set to an electro beat. The snake moves on every 16th note, and lasers
fire on the beat. A laser slices the wyrm where it crosses: the head side lives
on, the rest pops away and takes its points with it. Every 8 bars the tempo
rises and more lasers come.

- Arrows / WASD to steer, Space to pause, B for music, M for sound
- Fruit: apple +1, cherries +3, star +5
- Pills: blue shield, yellow double points, purple slow-mo
- The snipper hunts your middle: bite it for +3

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
