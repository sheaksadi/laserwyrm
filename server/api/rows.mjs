/** How database rows go out as JSON, and limits the routes share. */

export const BOARD_MAX = 100

export const MODES = new Set(['normal', 'hardcore'])
export const gameRow = (r) => ({
  code: r.code,
  mode: r.mode ?? 'normal',
  name: r.name ?? null,
  score: r.score,
  level: r.level,
  steps: r.steps,
  cheated: r.cheated,
  created_at: new Date(r.created_at).toISOString(),
})
export const scoreRow = (r) => ({
  id: Number(r.id),
  mode: r.mode ?? 'normal',
  name: r.name,
  code: r.code ?? null,
  score: r.score,
  level: r.level,
  steps: r.steps,
  created_at: new Date(r.created_at).toISOString(),
})

export const designRow = (r) => ({
  slug: r.slug,
  name: r.name,
  about: r.about,
  author: r.author ?? 'guest',
  plays: r.plays,
  likes: r.likes,
  liked: !!r.liked,
  levels: Number(r.levels ?? 0),
  items: Number(r.items ?? 0),
  created_at: new Date(r.created_at).toISOString(),
})
