import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mutateSources, readSources } from '../src/data-source/persistence/sources-store.ts'
import type { DataSourceRecord } from '../src/data-source/types.ts'

let dshHome: string
let previousDshHome: string | undefined

beforeEach(async () => {
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-data-agent-test-'))
  previousDshHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome
})

afterEach(async () => {
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  await rm(dshHome, { recursive: true, force: true })
})

function record(id: string): DataSourceRecord {
  return {
    id,
    engine: 'sqlite',
    database: `/tmp/${id}.db`,
    readOnly: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('sources-store', () => {
  it('reads an empty array when no file exists yet', async () => {
    expect(await readSources()).toEqual([])
  })

  it('round-trips a written record', async () => {
    await mutateSources(current => ({ next: [...current, record('a')], result: undefined }))
    expect(await readSources()).toEqual([record('a')])
  })

  it('aborts the write when the mutator throws, leaving the file untouched', async () => {
    await mutateSources(current => ({ next: [...current, record('a')], result: undefined }))
    await expect(
      mutateSources(() => {
        throw new Error('validation failed')
      }),
    ).rejects.toThrow('validation failed')
    expect(await readSources()).toEqual([record('a')])
  })

  it('serializes concurrent mutations without losing an update', async () => {
    await Promise.all([
      mutateSources(current => ({ next: [...current, record('a')], result: undefined })),
      mutateSources(current => ({ next: [...current, record('b')], result: undefined })),
    ])
    const ids = (await readSources()).map(r => r.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('returns a result from the mutator alongside persisting the next state', async () => {
    const result = await mutateSources(current => ({ next: [...current, record('a')], result: record('a') }))
    expect(result.id).toBe('a')
  })
})
