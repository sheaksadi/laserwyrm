/**
 * The game engine.
 *
 * Classic snake, set to music. The conductor in `audio.ts` is the clock: the
 * snake moves on every 16th note, and lasers arm on a beat and strike on a
 * later one, right on the zap in the track. Every eight bars the level goes
 * up: the tempo rises, the track fills out, and more lasers come, with less
 * warning.
 *
 * Scoring: every beat the snake survives scores its multiplier, which grows
 * faster than its length and climbs with the level, so a long snake late in
 * the game is worth far more than a short one early. Fruit only grows it.
 *
 * A laser slices the body where it crosses: the head side lives on, and the
 * rest lies there for a moment, then pops cell by cell. Points already scored
 * stay, but the multiplier drops. Only a laser through the head costs a heart;
 * the third ends the game. Walls and biting yourself end it at once. Each new
 * level refills a heart up to three; a rare heart drop can take you to five.
 *
 * Power-ups are held, not swallowed: the snake carries up to two and uses
 * the oldest on Space. One picked up with both slots full works at once. The
 * Totem of Undying is rare and passive: it cheats one death of any kind.
 *
 * Cheats (the C menu) can jump levels, turn on god mode and hand out items.
 * A run that used any of them never counts toward the best score.
 *
 * Two modes. Normal: walls wrap the snake to the other side, each level
 * refills a heart up to three, and each new kind of laser is introduced with
 * a short pause (the music slides to a stop and comes back in a new
 * arrangement) and then a calmer stretch. Hardcore: walls kill, no hearts
 * back, no pauses, no calm. Each mode has its own high scores.
 *
 * Every run is reproducible: all chance comes from one seeded generator, all
 * timing that matters is counted in steps, and each input is logged against
 * the step it landed before. Seed, grid size and inputs are a replay; feeding
 * them back through the same engine plays the game again exactly.
 *
 * The engine is split by job, one file each in this folder:
 *   catalog   types, stock tables and tuning numbers (nothing changes in play)
 *   rng       the seeded generator all chance comes from
 *   curve     how each level plays, read from the design (tempo, lasers, …)
 *   state     the reactive run the view draws, cheats, replay and match flags
 *   layout    where the board sits on screen
 *   board     walls, items on the board, popups, banners and notices
 *   engine    reset, and every step, beat and bar; the frame loop
 *   levels    level rules that depend on the run, and arriving at a level
 *   lasers    making, moving and striking lasers
 *   hits      cuts, death, the totem and respawns
 *   snipper   the snipper
 *   items     eating, power-ups and their effects, item drops
 *   controls  play, pause, steer, use, mode, cheats (input is recorded here)
 *   replay    playing back a recorded run
 *   match     a multiplayer match, from the game's side
 *   demo      the start screen's self-playing backdrop
 *
 * Everything outside imports from here ('./game'), never from those files.
 */
export {
  DIRS, FRUIT_GROW, GRID, HEART_PATH, LASER_TIERS, LASER_TRAITS, MAX_HEARTS, MAX_HELD, MAX_LEVEL, POWERS, POWER_KINDS,
  START_HEARTS, TIER_NOTE_MS, TONE_COLOR, TOTEM, customItem, isCustom, isPower, itemInfo, tierOf,
  type Beam, type CustomId, type Debris, type DirName, type Feel, type FruitKind, type Holdable, type Item, type ItemKind,
  type Laser, type LaserKind, type LaserTrait, type Mark, type Mode, type Popup, type PowerKind, type Replay, type ReplayEvent,
  type Tone, type Vec,
} from './catalog'
export { heldSlots, intensity, startHearts, tempoFor, traitsFor } from './curve'
export { cheats, demo, isActive, lastReplay, match, onFeel, onMark, replay, state } from './state'
export { arenaInsets, fitGrid, fitLayout, isTouch, layout } from './layout'
export { reset } from './engine'
export { levelFeel, levelPlan, multiplier } from './levels'
export { effectLeft } from './items'
export { cheatGive, cheatLevel, cheatToggle, pause, play, resetBest, setMode, toggle, turn, useItem } from './controls'
export { replaySeek, replayTo, runSeconds, startReplay, stopReplay } from './replay'
export { endMatch, goMatch, haltMatch, prepareMatch } from './match'
export { startDemo, stopDemo } from './demo'

import { startEngine } from './engine'

startEngine()
