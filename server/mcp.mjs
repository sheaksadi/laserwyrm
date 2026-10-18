/**
 * The Laserwyrm MCP server: AI agents (Claude Code, Codex, OpenCode, Cursor,
 * Gemini CLI…) make and change a player's custom games, the way the player
 * does in the workshop. They cannot play, post scores or touch anything
 * else: an agent key only opens these tools, for that one player's games.
 *
 * Transport: Streamable HTTP, stateless, one JSON-RPC message per POST to
 * /mcp, answered with JSON. Auth: `Authorization: Bearer lwa_…` (an agent
 * key the player makes in the game, under ☰ → AI agent).
 *
 * Games are the player's synced library (table user_games); the game in the
 * browser pulls changes every few seconds, so edits show up live.
 * Everything that comes in goes through the same cleaning as in the game
 * (src/designCore.ts).
 */
import * as core from '../src/designCore.ts'

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const COLS = 48
const ROWS = 26

const INSTRUCTIONS = `Laserwyrm is a snake game set to an electro beat: the snake moves on 16th notes, lasers fire on the beat and slice it, and the music is written in Strudel.
These tools edit the signed-in player's custom games (their "design": a global difficulty curve, game rules, up to 150 levels with walls, pacing, feel, items and Strudel music, and home-made items). You cannot play the game.
Start with describe_game_format, then list_games / create_game. Levels are numbered from 1. A level only stores what it changes; everything else follows the global curve. Walls are a 48×26 grid. Changes show up in the player's game within a few seconds.`

class ToolError extends Error {}

/* ─── Helpers ─── */

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const text = (value) => ({ content: [{ type: 'text', text: value }] })
const levelIndex = (design, level) => {
  const n = Number(level)
  if (!Number.isInteger(n) || n < 1 || n > core.MAX_LEVELS) throw new ToolError(`level must be a whole number from 1 to ${core.MAX_LEVELS}`)
  while (design.levels.length < n) design.levels.push({})
  return n - 1
}
function summary(design) {
  const changed = design.levels.filter((l) => Object.keys(l).length).length
  return { stock: core.isStock(design), levelsChanged: changed, items: design.custom.length, music: !!design.music, background: !!design.background }
}
/** Walls as text: one string per row, # a wall, . empty, S the snake's start (always clear). */
function wallsToRows(level) {
  const walls = new Set(core.unpackWalls(level.walls, COLS * ROWS))
  const start = new Set(core.startCells(COLS, ROWS))
  const rows = []
  for (let y = 0; y < ROWS; y++) {
    let row = ''
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x
      row += start.has(i) ? 'S' : walls.has(i) ? '#' : '.'
    }
    rows.push(row)
  }
  return rows
}
function cellsFrom(args) {
  const out = []
  if (Array.isArray(args.rows)) {
    args.rows.slice(0, ROWS).forEach((row, y) => {
      for (let x = 0; x < Math.min(COLS, String(row).length); x++) if (String(row)[x] === '#') out.push(y * COLS + x)
    })
  }
  if (Array.isArray(args.cells)) {
    for (const c of args.cells) {
      const [x, y] = Array.isArray(c) ? c : [c?.x, c?.y]
      if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < COLS && y < ROWS) out.push(y * COLS + x)
    }
  }
  return out
}

/* ─── The tools ─── */

const levelFields = {
  name: { type: 'string', description: 'Shown when the level starts' },
  difficulty: { type: 'number', description: '× on this level\'s intensity, 0–2 (1 = the curve)' },
  bpm: { type: 'number', description: 'Tempo, 60–220' },
  lasers: { type: 'number', description: 'Lasers per bar on average, 0–12' },
  armed: { type: 'number', description: 'Most lasers armed at once, 0–16' },
  warn: { type: 'number', description: 'Warning before a strike, in 16th notes, 4–24' },
  bars: { type: 'number', description: 'Bars before the next level, 1–32' },
  traits: { type: 'array', items: { type: 'string', enum: core.TRAITS }, description: 'Laser tricks that can appear (plain lasers always can)' },
  edges: { type: 'string', enum: ['wrap', 'kill'], description: 'Board edges wrap round or kill' },
  snipper: { type: 'number', description: 'Snipper frequency × (0 = never), 0–2' },
  heal: { type: 'number', description: 'Hearts given back on reaching this level, 0–5' },
  intro: { type: 'boolean', description: 'Pause two bars to introduce this level' },
  calm: { type: 'number', description: 'Bars of fewer lasers at the start, 0–16' },
  score: { type: 'number', description: '× on points, 0–5' },
  items: { type: 'object', additionalProperties: { type: 'number' }, description: 'Item id → × on its chance on this level (0–4)' },
}

const TOOLS = [
  {
    name: 'whoami',
    description: 'The player these tools act for.',
    inputSchema: { type: 'object', properties: {} },
    run: async ({ user }) => json({ player: user.name }),
  },
  {
    name: 'describe_game_format',
    description: 'How a Laserwyrm design is built: fields, ranges, stock values, items, walls and music. Read this first.',
    inputSchema: { type: 'object', properties: {} },
    run: async () =>
      json({
        board: { cols: COLS, rows: ROWS, startCells: 'the snake starts in row 13, columns 17–23 (0-based); those cells are always clear' },
        levels: { stock: core.STOCK_LEVELS, max: core.MAX_LEVELS, numbering: 'from 1', fields: Object.fromEntries(Object.entries(levelFields).map(([k, v]) => [k, v.description])), music: 'Strudel code for the level (one cycle = one bar, tempo from the level)', background: 'Strudel code playing under the music' },
        global: { stock: core.STOCK_GLOBAL, ranges: core.GLOBAL_RANGE, meaning: 'intensity = (level<10 ? level*start : 10*start + (level-10)*climb + (level-10)^2*end) * overall * level.difficulty; tempo = tempoStart + 8*intensity, capped at tempoMax' },
        rules: { stock: core.STOCK_RULES, ranges: core.RULES_RANGE },
        laserTraits: { wide: 'three cells wide (stock from level 11)', cross: 'row and column at once (21)', fast: 'half the warning (31)', track: 'follows your head (41)', repeat: 'strikes twice (51)' },
        stockItems: ['apple', 'cherry', 'star', 'heart', 'totem', 'shield', 'double', 'slow', 'dash', 'magnet', 'ghost'],
        itemTweak: { rate: '× chance', life: 'bars on the board', bars: 'effect length', stack: 'extend | refresh | keep', grow: 'cells (fruit)' },
        customItem: { kind: 'fruit | power', shape: core.SHAPES, color: core.COLORS, fields: 'name, blurb, rate (0–0.5 a bar), from (0-based level), life, grow, points, hearts (fruit); effects (shield, double, slow, dash, magnet, ghost), bars, stack, hold (power)' },
        strudel: 'Synths: sine square triangle sawtooth supersaw pulse; drum: sbd; noise: white pink brown. Example: stack(s("sbd*4"), note("<a2 f2 c3 g2>").s("sawtooth").lpf(800))',
      }),
  },
  {
    name: 'list_games',
    description: "The player's custom games.",
    inputSchema: { type: 'object', properties: {} },
    run: async ({ store }) => json((await store.list()).map((g) => ({ id: g.gid, name: g.name, updated: g.updated_at, ...summary(core.cleanDesign(g.design)) }))),
  },
  {
    name: 'create_game',
    description: 'Make a new custom game: the stock game, or from a share code (LW2-…).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string', description: 'An LW2- share code to start from' } }, required: ['name'] },
    run: async ({ store }, { name, code }) => {
      let design = core.stockDesign()
      if (code) {
        const read = core.readShareCode(String(code))
        if (!read) throw new ToolError('that is not a Laserwyrm share code')
        design = read
      }
      const gid = await store.create(String(name || 'Agent game').slice(0, 40), design)
      return json({ id: gid })
    },
  },
  {
    name: 'get_game',
    description: 'A game in full: global feel, rules, music, items, and every level that changes something.',
    inputSchema: { type: 'object', properties: { game: { type: 'string', description: 'Game id' } }, required: ['game'] },
    run: async ({ store }, { game }) => {
      const g = await store.get(game)
      const d = core.cleanDesign(g.design)
      const levels = Object.fromEntries(d.levels.map((l, i) => [i + 1, l]).filter(([, l]) => Object.keys(l).length).map(([n, l]) => [n, { ...l, walls: l.walls ? `${core.unpackWalls(l.walls, COLS * ROWS).length} walls (get_level for the grid)` : undefined }]))
      return json({ id: g.gid, name: g.name, ...summary(d), global: d.global, rules: d.rules, music: d.music ?? null, background: d.background ?? null, items: d.items, custom: d.custom, levelCount: d.levels.length, levels })
    },
  },
  {
    name: 'rename_game',
    description: 'Rename a game.',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, name: { type: 'string' } }, required: ['game', 'name'] },
    run: async ({ store }, { game, name }) => {
      const g = await store.get(game)
      await store.save(g.gid, String(name).slice(0, 40), g.design)
      return text('renamed')
    },
  },
  {
    name: 'delete_game',
    description: 'Delete a game (the player keeps at least one).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' } }, required: ['game'] },
    run: async ({ store }, { game }) => {
      if ((await store.list()).length <= 1) throw new ToolError('the player keeps at least one game')
      await store.remove(game)
      return text('deleted')
    },
  },
  {
    name: 'get_level',
    description: 'One level: what it changes, and its walls as a 48×26 grid (# wall, . empty, S start).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, level: { type: 'integer', minimum: 1 } }, required: ['game', 'level'] },
    run: async ({ store }, { game, level }) => {
      const g = await store.get(game)
      const d = core.cleanDesign(g.design)
      const i = levelIndex(d, level)
      const { walls, ...rest } = d.levels[i]
      return json({ level: i + 1, changes: rest, walls: wallsToRows({ walls }) })
    },
  },
  {
    name: 'update_level',
    description: "Change a level's settings. Pass only what to set; list fields in `clear` to put them back to the curve.",
    inputSchema: {
      type: 'object',
      properties: { game: { type: 'string' }, level: { type: 'integer', minimum: 1 }, set: { type: 'object', properties: levelFields }, clear: { type: 'array', items: { type: 'string' } } },
      required: ['game', 'level'],
    },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        const i = levelIndex(d, args.level)
        const next = { ...d.levels[i], ...(args.set ?? {}) }
        for (const k of args.clear ?? []) delete next[k]
        d.levels[i] = next
        return () => {
          const { walls, ...changes } = core.cleanDesign(d).levels[i]
          return { level: i + 1, changes, walls: core.unpackWalls(walls, COLS * ROWS).length }
        }
      }),
  },
  {
    name: 'set_walls',
    description: "Draw a level's walls: give `rows` (up to 26 strings of 48 chars, # for a wall) and/or `cells` ([x, y], 0-based). mode: replace (default), add or remove. Start cells stay clear.",
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string' },
        level: { type: 'integer', minimum: 1 },
        rows: { type: 'array', items: { type: 'string' } },
        cells: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
        mode: { type: 'string', enum: ['replace', 'add', 'remove'] },
      },
      required: ['game', 'level'],
    },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        const i = levelIndex(d, args.level)
        const start = new Set(core.startCells(COLS, ROWS))
        const given = cellsFrom(args).filter((c) => !start.has(c))
        const set = new Set(args.mode === 'replace' || !args.mode ? [] : core.unpackWalls(d.levels[i].walls, COLS * ROWS))
        for (const c of given) args.mode === 'remove' ? set.delete(c) : set.add(c)
        const packed = core.packWalls(set, COLS, ROWS)
        if (packed) d.levels[i].walls = packed
        else delete d.levels[i].walls
        return () => ({ level: i + 1, walls: set.size })
      }),
  },
  {
    name: 'add_template_walls',
    description: 'Add or remove a built-in wall layout on a level: border, corners, pillars, cross, lanes, arena.',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, level: { type: 'integer', minimum: 1 }, template: { type: 'string', enum: ['border', 'corners', 'pillars', 'cross', 'lanes', 'arena'] }, remove: { type: 'boolean' } }, required: ['game', 'level', 'template'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        const i = levelIndex(d, args.level)
        const t = core.stockTemplates(COLS, ROWS).find((x) => x.id === args.template)
        if (!t) throw new ToolError('no such template')
        const set = new Set(core.unpackWalls(d.levels[i].walls, COLS * ROWS))
        for (const c of core.unpackWalls(t.walls, COLS * ROWS)) args.remove ? set.delete(c) : set.add(c)
        const packed = core.packWalls(set, COLS, ROWS)
        if (packed) d.levels[i].walls = packed
        else delete d.levels[i].walls
        return () => ({ level: i + 1, walls: set.size })
      }),
  },
  {
    name: 'set_global',
    description: 'Change the whole game\'s difficulty curve and pacing (overall, start, climb, end, tempoStart, tempoMax, warn, lasers, barsPerLevel).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, set: { type: 'object', additionalProperties: { type: 'number' } } }, required: ['game', 'set'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        Object.assign(d.global, args.set)
        return () => ({ global: core.cleanDesign(d).global })
      }),
  },
  {
    name: 'set_rules',
    description: 'Change the game rules: hearts, maxHearts, refill, length, slots, startLevel (0-based).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, set: { type: 'object', additionalProperties: { type: 'number' } } }, required: ['game', 'set'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        Object.assign(d.rules, args.set)
        return () => ({ rules: core.cleanDesign(d).rules })
      }),
  },
  {
    name: 'set_music',
    description: 'Set Strudel code for the whole game or one level, on the main track or the background track. code null puts it back (stock music / no background).',
    inputSchema: {
      type: 'object',
      properties: { game: { type: 'string' }, level: { type: 'integer', minimum: 1, description: 'Omit for the whole game' }, track: { type: 'string', enum: ['main', 'background'] }, code: { type: ['string', 'null'] } },
      required: ['game', 'code'],
    },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        const field = args.track === 'background' ? 'background' : 'music'
        const target = args.level ? d.levels[levelIndex(d, args.level)] : d
        if (args.code) target[field] = String(args.code)
        else delete target[field]
        return () => ({ ok: true, note: 'The game checks Strudel code when it loads it; code that does not compile is skipped (stock music plays).' })
      }),
  },
  {
    name: 'add_level',
    description: 'Add a level after the last (up to 150).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, name: { type: 'string' } }, required: ['game'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        if (d.levels.length >= core.MAX_LEVELS) throw new ToolError('already 150 levels')
        d.levels.push({ name: args.name ? String(args.name) : `Level ${d.levels.length + 1}` })
        return () => ({ level: d.levels.length })
      }),
  },
  {
    name: 'reset_level',
    description: 'Put a level back to following the curve (forget all its changes).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, level: { type: 'integer', minimum: 1 } }, required: ['game', 'level'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        d.levels[levelIndex(d, args.level)] = {}
        return () => ({ ok: true })
      }),
  },
  {
    name: 'tweak_stock_item',
    description: 'Change a stock item for the whole game (rate, life, bars, stack, grow). Empty `set` puts it back.',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, item: { type: 'string' }, set: { type: 'object' } }, required: ['game', 'item', 'set'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        if (Object.keys(args.set).length) d.items[args.item] = args.set
        else delete d.items[args.item]
        return () => ({ items: core.cleanDesign(d).items })
      }),
  },
  {
    name: 'add_item',
    description: 'Make a home-made fruit or power-up (see describe_game_format for fields).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, kind: { type: 'string', enum: ['fruit', 'power'] }, set: { type: 'object' } }, required: ['game', 'kind'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        if (d.custom.length >= 24) throw new ToolError('24 home-made items at most')
        const id = `c${d.nextItem++}`
        d.custom.push({ ...core.newItem(id, args.kind), ...(args.set ?? {}), id, kind: args.kind })
        return () => ({ id })
      }),
  },
  {
    name: 'update_item',
    description: 'Change a home-made item.',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, id: { type: 'string' }, set: { type: 'object' } }, required: ['game', 'id', 'set'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        const item = d.custom.find((c) => c.id === args.id)
        if (!item) throw new ToolError('no such item')
        Object.assign(item, args.set, { id: item.id })
        return () => ({ item: core.cleanDesign(d).custom.find((c) => c.id === args.id) })
      }),
  },
  {
    name: 'remove_item',
    description: 'Delete a home-made item.',
    inputSchema: { type: 'object', properties: { game: { type: 'string' }, id: { type: 'string' } }, required: ['game', 'id'] },
    run: (ctx, args) =>
      ctx.edit(args.game, (d) => {
        d.custom = d.custom.filter((c) => c.id !== args.id)
        for (const l of d.levels) if (l.items) delete l.items[args.id]
        return () => ({ ok: true })
      }),
  },
  {
    name: 'share_code',
    description: 'The game as an LW2- share code (the player can paste it anywhere).',
    inputSchema: { type: 'object', properties: { game: { type: 'string' } }, required: ['game'] },
    run: async ({ store }, { game }) => text(core.shareCode(core.cleanDesign((await store.get(game)).design))),
  },
]

/* ─── JSON-RPC over HTTP ─── */

/**
 * Answer one MCP message. `store` reads and writes this player's games;
 * returns the JSON-RPC reply, or null for a notification.
 */
export async function handleMcp(message, { user, store }) {
  const { id, method, params } = message ?? {}
  const reply = (result) => ({ jsonrpc: '2.0', id, result })
  const fail = (code, msg) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message: msg } })
  if (id === undefined || id === null) return null // notifications (initialized, cancelled…)
  try {
    if (method === 'initialize') {
      const asked = params?.protocolVersion
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'laserwyrm', title: 'Laserwyrm workshop', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    if (method === 'ping') return reply({})
    if (method === 'tools/list') return reply({ tools: TOOLS.map(({ run, ...t }) => t) })
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name)
      if (!tool) return fail(-32602, `no tool ${params?.name}`)
      const ctx = {
        user,
        store,
        /** Change a game's design, clean it, save it, and answer with what `change` returns. */
        async edit(gid, change) {
          const g = await store.get(gid)
          const d = core.cleanDesign(g.design)
          const answer = change(d)
          await store.save(g.gid, g.name, core.compact(core.cleanDesign(d)))
          return json(answer())
        },
      }
      try {
        return reply(await tool.run(ctx, params?.arguments ?? {}))
      } catch (err) {
        if (err instanceof ToolError) return reply({ content: [{ type: 'text', text: err.message }], isError: true })
        throw err
      }
    }
    return fail(-32601, `no method ${method}`)
  } catch (err) {
    if (err?.status === 404) return reply({ content: [{ type: 'text', text: err.message }], isError: true })
    console.error(err)
    return fail(-32603, 'server error')
  }
}
