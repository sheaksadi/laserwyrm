/**
 * Codes, names and input checks: game codes (BORK#4821), login codes,
 * player names, share slugs and agent keys, and the cleaning of what clients
 * send (replays, designs, emails) before it is stored.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { WORDS } from './words.mjs'

/* ─── Codes and names ─────────────────────────────────────────────────── */

const CODE_RE = /^([A-Za-z]{4})[#\-_ ]?(\d{4})$/
/** BORK#4821, bork-4821, BORK4821 → BORK#4821; anything else → null. */
export function normalizeCode(raw) {
  const m = String(raw ?? '').trim().match(CODE_RE)
  return m ? `${m[1].toUpperCase()}#${m[2]}` : null
}
export const newGameCode = () => `${WORDS[randomInt(WORDS.length)]}#${String(randomInt(10000)).padStart(4, '0')}`

/** A secret login code: four groups of four, no look-alike letters. */
export const LOGIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newLoginCode() {
  const bytes = randomBytes(16)
  const chars = [...bytes].map((b) => LOGIN_ALPHABET[b % LOGIN_ALPHABET.length])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')
}
export const hashToken = (code) => createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex')

export const NAME_RE = /^[A-Za-z0-9_-]{1,12}$/
export const nameKey = (name) => name.toLowerCase()

/* ─── Checking input ──────────────────────────────────────────────────── */

const CODES = new Set(['u', 'd', 'l', 'r', 'i'])
export const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

/** A cleaned replay, or a reason it was refused. */
export function checkReplay(r) {
  if (!r || r.v !== 1) return 'replay missing or unknown version'
  if (!int(r.seed, 0, 2 ** 32 - 1)) return 'replay seed is invalid'
  if (!int(r.cols, 12, 400) || !int(r.rows, 12, 400)) return 'replay grid is invalid'
  if (!int(r.steps, 1, 2_000_000)) return 'replay length is invalid'
  if (!Array.isArray(r.events) || r.events.length > r.steps * 2 + 16) return 'replay inputs are invalid'
  let last = 0
  for (const e of r.events) {
    if (!Array.isArray(e) || e.length !== 2 || !int(e[0], last, r.steps) || !CODES.has(e[1])) return 'replay inputs are invalid'
    last = e[0]
  }
  const mode = r.mode === 'hardcore' ? 'hardcore' : 'normal'
  const out = { v: 1, mode, seed: r.seed, cols: r.cols, rows: r.rows, steps: r.steps, events: r.events }
  // Which item table the run used (2 has the cookies); missing means 1.
  if (int(r.rev, 1, 9)) out.rev = r.rev
  // A changed game's design rides along so the run plays back the same; the game checks it on load.
  if (r.design !== undefined) {
    if (!r.design || typeof r.design !== 'object' || Array.isArray(r.design) || JSON.stringify(r.design).length > 200_000) return 'replay design is invalid'
    out.design = r.design
  }
  return out
}

/** JSON with keys sorted, so two designs compare equal however their keys were ordered (JSONB reorders them). */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}

/** A shared design: a plain object of reasonable size. The game cleans it again when it loads it. */
export function checkDesign(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'design missing'
  if (JSON.stringify(d).length > 200_000) return 'design is too big'
  if (!d.global || typeof d.global !== 'object') return 'design has no global settings'
  return null
}
/** A design's share code: six letters and digits, no look-alikes (K7QM2X), easy to read out or type. */
/** An AI agent's key: lwa_ and 32 random characters. Only the MCP tools accept it. */
export const newAgentKey = () => `lwa_${randomBytes(24).toString('base64url')}`
export const newGid = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x')

export const newSlug = () => [...randomBytes(6)].map((b) => LOGIN_ALPHABET[b % LOGIN_ALPHABET.length]).join('')

export function checkEmail(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string' || raw.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) return false
  return raw.trim()
}
