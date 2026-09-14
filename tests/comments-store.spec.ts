import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearSourceComments,
  getColumnComment,
  getSourceComments,
  getTableComment,
  setComment,
} from '../src/data-source/persistence/comments-store.ts'

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

describe('comments-store', () => {
  it('returns undefined for an unset comment', async () => {
    expect(await getTableComment('src', 'orders')).toBeUndefined()
    expect(await getColumnComment('src', 'orders', 'status')).toBeUndefined()
  })

  it('sets and reads a table comment', async () => {
    await setComment('src', 'orders', undefined, 'Customer orders')
    expect(await getTableComment('src', 'orders')).toBe('Customer orders')
  })

  it('sets and reads a column comment independently of the table comment', async () => {
    await setComment('src', 'orders', undefined, 'Customer orders')
    await setComment('src', 'orders', 'status', 'Order lifecycle state')
    expect(await getTableComment('src', 'orders')).toBe('Customer orders')
    expect(await getColumnComment('src', 'orders', 'status')).toBe('Order lifecycle state')
  })

  it('clears a comment by passing null, without disturbing siblings', async () => {
    await setComment('src', 'orders', undefined, 'Customer orders')
    await setComment('src', 'orders', 'status', 'Order lifecycle state')
    await setComment('src', 'orders', 'status', null)
    expect(await getColumnComment('src', 'orders', 'status')).toBeUndefined()
    expect(await getTableComment('src', 'orders')).toBe('Customer orders')
  })

  it('round-trips an untouched source to an empty object, not a tree of empty entries', async () => {
    await setComment('src', 'orders', 'status', 'x')
    await setComment('src', 'orders', 'status', null)
    expect(await getSourceComments('src')).toEqual({})
  })

  it('clearSourceComments removes every comment for a source', async () => {
    await setComment('src', 'orders', undefined, 'Customer orders')
    await setComment('src', 'orders', 'status', 'Order lifecycle state')
    await clearSourceComments('src')
    expect(await getSourceComments('src')).toEqual({})
  })
})
