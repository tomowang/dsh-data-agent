import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryResultCache, type CachedQueryResult } from '../src/tools/query-result-cache.ts'

function sampleResult(n: number): CachedQueryResult {
  return {
    sourceName: 'sample',
    sql: `SELECT ${n}`,
    columns: [{ name: 'x' }],
    rows: [{ x: n }],
    rowCount: 1,
    truncated: false,
  }
}

let ctx: Context
let cache: QueryResultCache

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(QueryResultCache)
  cache = ctx.queryResultCache
})

afterEach(() => {
  vi.useRealTimers()
})

describe('QueryResultCache', () => {
  it('round-trips a result within the same session', () => {
    const id = cache.put('session-a', sampleResult(1))
    expect(id).not.toBeUndefined()
    expect(cache.get('session-a', id!)).toEqual(sampleResult(1))
  })

  it('does not cache or look up without a session id', () => {
    expect(cache.put(undefined, sampleResult(1))).toBeUndefined()
    const id = cache.put('session-a', sampleResult(1))
    expect(cache.get(undefined, id!)).toBeUndefined()
  })

  it('is isolated per session', () => {
    const id = cache.put('session-a', sampleResult(1))
    expect(cache.get('session-b', id!)).toBeUndefined()
  })

  it('misses on an unknown result id', () => {
    cache.put('session-a', sampleResult(1))
    expect(cache.get('session-a', 'not-a-real-id')).toBeUndefined()
  })

  it('evicts the oldest entry once a session exceeds its per-session cap', () => {
    const ids = Array.from({ length: 21 }, (_, i) => cache.put('session-a', sampleResult(i))!)
    expect(cache.get('session-a', ids[0]!)).toBeUndefined()
    expect(cache.get('session-a', ids[ids.length - 1]!)).toEqual(sampleResult(20))
  })

  it('expires an entry after its TTL', () => {
    vi.useFakeTimers()
    const id = cache.put('session-a', sampleResult(1))!
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(cache.get('session-a', id)).toBeUndefined()
  })
})
