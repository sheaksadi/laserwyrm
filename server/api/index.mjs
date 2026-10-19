/**
 * The API's handlers, one group per file. Each takes the request (and what
 * the router pulled out of the path) and returns a JSON body, or
 * `{ status, body }` for anything but 200; errors are thrown as HttpError.
 */
import { designRoutes } from './designs.mjs'
import { gameRoutes } from './games.mjs'
import { libraryRoutes } from './library.mjs'
import { playerRoutes } from './players.mjs'
import { scoreRoutes } from './scores.mjs'

export function api(db) {
  return {
    async health() {
      return { ok: true, store: db.kind }
    },
    ...playerRoutes(db),
    ...gameRoutes(db),
    ...scoreRoutes(db),
    ...libraryRoutes(db),
    ...designRoutes(db),
  }
}
