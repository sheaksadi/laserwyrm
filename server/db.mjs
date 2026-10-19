/**
 * The database: Postgres when DATABASE_URL is set, otherwise PGlite
 * (Postgres in-process, kept in .data/pglite) so the same SQL runs
 * everywhere. The schema runs on every start: add changes as new
 * `… IF NOT EXISTS` lines at the end, never by editing old ones.
 */
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    name_key    TEXT NOT NULL UNIQUE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS games (
    id          BIGSERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    user_id     BIGINT REFERENCES users(id),
    score       INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    steps       INTEGER NOT NULL,
    cheated     BOOLEAN NOT NULL DEFAULT false,
    replay      JSONB NOT NULL,
    ip_hash     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS games_user_idx ON games (user_id, created_at DESC);
  ALTER TABLE games ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'normal';
  CREATE TABLE IF NOT EXISTS scores (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    score       INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    steps       INTEGER NOT NULL,
    replay      JSONB,
    ip_hash     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE scores ALTER COLUMN replay DROP NOT NULL;
  ALTER TABLE scores ADD COLUMN IF NOT EXISTS game_id BIGINT REFERENCES games(id);
  ALTER TABLE scores ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
  CREATE UNIQUE INDEX IF NOT EXISTS scores_game_idx ON scores (game_id);
  CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC, created_at ASC);
  CREATE TABLE IF NOT EXISTS designs (
    id          BIGSERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    about       TEXT NOT NULL DEFAULT '',
    design      JSONB NOT NULL,
    plays       INTEGER NOT NULL DEFAULT 0,
    likes       INTEGER NOT NULL DEFAULT 0,
    removed     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS designs_new_idx ON designs (created_at DESC);
  CREATE TABLE IF NOT EXISTS design_likes (
    design_id   BIGINT NOT NULL REFERENCES designs(id),
    user_id     BIGINT NOT NULL REFERENCES users(id),
    PRIMARY KEY (design_id, user_id)
  );
  ALTER TABLE designs ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE designs ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE games ADD COLUMN IF NOT EXISTS design_id BIGINT REFERENCES designs(id);
  ALTER TABLE games ADD COLUMN IF NOT EXISTS design_clean BOOLEAN NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS games_design_idx ON games (design_id, score DESC);
  CREATE TABLE IF NOT EXISTS user_games (
    user_id     BIGINT NOT NULL REFERENCES users(id),
    gid         TEXT NOT NULL,
    name        TEXT NOT NULL,
    design      JSONB NOT NULL,
    deleted     BOOLEAN NOT NULL DEFAULT false,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, gid)
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS look JSONB;
  ALTER TABLE games ADD COLUMN IF NOT EXISTS seconds INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE IF NOT EXISTS agent_keys (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    key_hash    TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used   TIMESTAMPTZ,
    revoked     BOOLEAN NOT NULL DEFAULT false
  );
`

/** Postgres when DATABASE_URL is set, PGlite otherwise; both answer `query(sql, params) → { rows }`. */
export async function openDatabase() {
  const url = process.env.DATABASE_URL
  if (url) {
    const { default: pg } = await import('pg')
    // Managed databases often sit behind TLS with their own certificates.
    const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined
    const pool = new pg.Pool({ connectionString: url, ssl, max: 5 })
    await pool.query(SCHEMA)
    return { kind: 'postgres', query: (sql, params) => pool.query(sql, params) }
  }
  // Kept on disk, so restarting the local server keeps accounts and games.
  const dir = process.env.PGLITE_DIR ?? resolve(fileURLToPath(new URL('../.data/pglite', import.meta.url)))
  console.warn(`DATABASE_URL is not set: using PGlite in ${dir}.`)
  await mkdir(dir, { recursive: true })
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite(dir)
  await db.exec(SCHEMA)
  return { kind: 'pglite', query: (sql, params) => db.query(sql, params) }
}
