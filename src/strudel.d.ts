/** The parts of Strudel (@strudel/web, no types of its own) the game uses. */
declare module '@strudel/web' {
  export function setAudioContext(context: AudioContext): AudioContext
  export function initStrudel(options?: Record<string, unknown>): Promise<unknown>
  export function initAudio(options?: Record<string, unknown>): Promise<void>
  export function getSuperdoughAudioController(): unknown
  export function superdough(value: Record<string, unknown>, t: number, duration: number, cps?: number, cycle?: number): Promise<void>
}
