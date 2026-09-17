import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    chartImageStore: ChartImageStore
  }
}

/** Oldest entries are dropped past this count, independent of TTL, so a chatty session can't grow this unbounded. */
const MAX_ENTRIES = 100
/** A cached image older than this is treated as gone, even if still in memory — links are meant to be embedded shortly after the tool call that made them, not bookmarked. */
const TTL_MS = 30 * 60 * 1000

interface Entry {
  readonly buffer: Buffer
  readonly createdAt: number
}

function evictOldest(map: Map<string, Entry>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value
    if (oldestKey === undefined) return
    map.delete(oldestKey)
  }
}

function pruneExpired(map: Map<string, Entry>): void {
  const cutoff = Date.now() - TTL_MS
  for (const [id, entry] of map) {
    if (entry.createdAt < cutoff) map.delete(id)
  }
}

/**
 * In-memory store (`ctx.chartImageStore`) backing `da_render_chart`'s static
 * PNG output: `da_render_chart` `put`s a rendered buffer and gets back an id,
 * `chart-image-routes.ts` `get`s it back out to serve over HTTP. Not part of
 * the session log or any durable store — a miss (evicted, expired, or a
 * cold-started process) is a normal, self-correctable outcome for an
 * embedded `<img>` link: the chart just stops rendering, the surrounding
 * chat text is unaffected.
 *
 * Ids are `randomUUID()`, not sequential: the serving route has no
 * per-session auth (only `trust.ts`'s Origin check, same as every other raw
 * `ctx.webServer` route here), so a guessable id would let anything sharing
 * this origin enumerate other conversations' recent chart images.
 */
export class ChartImageStore extends Service {
  private readonly entries = new Map<string, Entry>()

  constructor(ctx: Context) {
    super(ctx, 'chartImageStore')
  }

  put(buffer: Buffer): string {
    pruneExpired(this.entries)
    const id = randomUUID()
    this.entries.set(id, { buffer, createdAt: Date.now() })
    evictOldest(this.entries, MAX_ENTRIES)
    return id
  }

  get(id: string): Buffer | undefined {
    const entry = this.entries.get(id)
    if (entry === undefined) return undefined
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.entries.delete(id)
      return undefined
    }
    return entry.buffer
  }
}
