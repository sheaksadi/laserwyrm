/**
 * Sprites as images: each drawing becomes a small PNG (one pixel per
 * pixel, scaled up crisp by the board), made once per drawing and kept.
 */
import { PALETTE, PIXEL_CHARS, SPRITE_SIZE, type Sprite } from './designCore'

const cache = new Map<string, string>()

/** A data URL for a sprite's pixels. */
export function spriteUrl(sprite: Pick<Sprite, 'pixels'>): string {
  const hit = cache.get(sprite.pixels)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SPRITE_SIZE
  const g = canvas.getContext('2d')!
  for (let i = 0; i < SPRITE_SIZE * SPRITE_SIZE; i++) {
    const c = PIXEL_CHARS.indexOf(sprite.pixels[i] ?? '.')
    if (c < 0) continue
    g.fillStyle = PALETTE[c]!
    g.fillRect(i % SPRITE_SIZE, Math.floor(i / SPRITE_SIZE), 1, 1)
  }
  const url = canvas.toDataURL('image/png')
  if (cache.size > 200) cache.clear()
  cache.set(sprite.pixels, url)
  return url
}
