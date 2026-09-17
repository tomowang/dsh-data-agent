import { Service, type Context } from '@deepseek-ai/cordis'
import type { QueryColumn, QueryRow } from '../data-source/types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    queryResultCache: QueryResultCache
  }
}

/** Oldest-per-session entries are dropped past this count, independent of TTL. */
const MAX_ENTRIES_PER_SESSION = 20
/** Oldest-touched session buckets are dropped past this count, so one runaway profile process can't grow unbounded. */
const MAX_SESSIONS = 200
/** A cached result older than this is treated as a miss, even if it's still in memory. */
const TTL_MS = 30 * 60 * 1000

export interface CachedQueryResult {
  readonly sourceName: string
  readonly sql: string
  readonly columns: readonly QueryColumn[]
  readonly rows: readonly QueryRow[]
  readonly rowCount: number
  readonly truncated: boolean
}

interface CacheEntry extends CachedQueryResult {
  readonly createdAt: number
}

function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value
    if (oldestKey === undefined) return
    map.delete(oldestKey)
  }
}

/**
 * Per-conversation cache of recent `da_run_sql` results (`ctx.queryResultCache`),
 * so `da_render_chart` can chart a prior result by reference (`resultId`)
 * without the model re-transcribing rows it may never have seen in full (chat
 * rendering already previews only the first rows of a large result).
 *
 * Scoped by `agent.id` (the conversation's `SessionId`, threaded through
 * `ToolRunContext.agent` — see `tool-types.ts`), not by anything durable: this
 * is a live, in-memory, best-effort cache, not part of the session log. A
 * cache miss (evicted, expired, wrong session, or no session at all) is a
 * normal, self-correctable outcome — the caller re-runs the query or passes
 * `data` inline instead.
 */
export class QueryResultCache extends Service {
  private readonly sessions = new Map<string, Map<string, CacheEntry>>()
  private counter = 0

  constructor(ctx: Context) {
    super(ctx, 'queryResultCache')
  }

  /** Cache `result` under `sessionId` and return its reference id, or `undefined` when there's no session to scope it to. */
  put(sessionId: string | undefined, result: CachedQueryResult): string | undefined {
    if (sessionId === undefined) return undefined

    // Re-insert to move this session to the MRU end of iteration order.
    const bucket = this.sessions.get(sessionId) ?? new Map<string, CacheEntry>()
    this.sessions.delete(sessionId)
    this.sessions.set(sessionId, bucket)
    evictOldest(this.sessions, MAX_SESSIONS)

    pruneExpired(bucket)
    const id = `r${++this.counter}`
    bucket.set(id, { ...result, createdAt: Date.now() })
    evictOldest(bucket, MAX_ENTRIES_PER_SESSION)
    return id
  }

  /** Look up a previously cached result by its `sessionId` + `resultId`, or `undefined` on any kind of miss. */
  get(sessionId: string | undefined, resultId: string): CachedQueryResult | undefined {
    if (sessionId === undefined) return undefined
    const bucket = this.sessions.get(sessionId)
    if (bucket === undefined) return undefined
    const entry = bucket.get(resultId)
    if (entry === undefined) return undefined
    if (Date.now() - entry.createdAt > TTL_MS) {
      bucket.delete(resultId)
      return undefined
    }
    const { createdAt: _createdAt, ...result } = entry
    return result
  }
}

function pruneExpired(bucket: Map<string, CacheEntry>): void {
  const cutoff = Date.now() - TTL_MS
  for (const [id, entry] of bucket) {
    if (entry.createdAt < cutoff) bucket.delete(id)
  }
}
