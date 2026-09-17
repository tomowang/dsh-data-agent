import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChartImageStore } from '../src/tools/chart-image-store.ts'

let ctx: Context
let store: ChartImageStore

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(ChartImageStore)
  store = ctx.chartImageStore
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ChartImageStore', () => {
  it('round-trips a buffer by the id it was put under', () => {
    const buffer = Buffer.from('png-bytes')
    const id = store.put(buffer)
    expect(store.get(id)).toEqual(buffer)
  })

  it('misses on an unknown id', () => {
    expect(store.get('not-a-real-id')).toBeUndefined()
  })

  it('evicts the oldest entry once the store exceeds its cap', () => {
    const ids = Array.from({ length: 101 }, (_, i) => store.put(Buffer.from(`png-${i}`)))
    expect(store.get(ids[0]!)).toBeUndefined()
    expect(store.get(ids[ids.length - 1]!)).toEqual(Buffer.from('png-100'))
  })

  it('expires an entry after its TTL', () => {
    vi.useFakeTimers()
    const id = store.put(Buffer.from('png'))
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(store.get(id)).toBeUndefined()
  })
})
