import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSourceRegistry } from '../src/data-source/registry.ts'

let dshHome: string
let previousDshHome: string | undefined
let dbFile: string

beforeEach(async () => {
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-data-agent-test-'))
  previousDshHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome

  dbFile = join(dshHome, 'sample.db')
  const seed = new DatabaseSync(dbFile)
  seed.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    INSERT INTO orders (id, status) VALUES (1, 'paid'), (2, 'pending');
  `)
  seed.close()
})

afterEach(async () => {
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  await rm(dshHome, { recursive: true, force: true })
})

async function createRegistry(): Promise<{ ctx: Context, registry: DataSourceRegistry, dispose: () => Promise<void> }> {
  const ctx = new Context()
  const fiber = await ctx.plugin(DataSourceRegistry)
  return { ctx, registry: ctx.dataAgent, dispose: () => fiber.dispose() }
}

describe('DataSourceRegistry', () => {
  it('adds, lists, and removes a source, persisting across a fresh registry instance', async () => {
    const first = await createRegistry()
    await first.registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })
    expect((await first.registry.list()).map(r => r.id)).toEqual(['sample'])
    await first.dispose()

    const second = await createRegistry()
    expect((await second.registry.list()).map(r => r.id)).toEqual(['sample'])
    const removal = await second.registry.removeSource('sample')
    expect(removal).toEqual({ id: 'sample', found: true })
    expect(await second.registry.list()).toEqual([])
    await second.dispose()
  })

  it('removeSource is idempotent for an unknown id', async () => {
    const { registry, dispose } = await createRegistry()
    expect(await registry.removeSource('missing')).toEqual({ id: 'missing', found: false })
    await dispose()
  })

  it('rejects a duplicate id without touching the existing record', async () => {
    const { registry, dispose } = await createRegistry()
    await registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })
    await expect(
      registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: false }),
    ).rejects.toThrow(/already exists/)
    expect((await registry.list())[0]?.readOnly).toBe(true)
    await dispose()
  })

  it('connects lazily and runs a query end-to-end against the seeded SQLite file', async () => {
    const { registry, dispose } = await createRegistry()
    await registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })

    const adapter = await registry.getAdapter('sample')
    const test = await adapter.testConnection()
    expect(test.ok).toBe(true)

    const schema = await adapter.getSchema({})
    expect(schema.tables.map(t => t.name)).toEqual(['orders'])

    const result = await adapter.runQuery('SELECT * FROM orders ORDER BY id', { maxRows: 500 })
    expect(result.rows).toEqual([{ id: 1, status: 'paid' }, { id: 2, status: 'pending' }])

    await dispose()
  })

  it('setReadOnly toggles the flag and drops any live connection so it reopens under the new mode', async () => {
    const { registry, dispose } = await createRegistry()
    await registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })
    await registry.getAdapter('sample')

    const updated = await registry.setReadOnly('sample', false)
    expect(updated.readOnly).toBe(false)
    expect((await registry.get('sample'))?.readOnly).toBe(false)

    await dispose()
  })

  it('rejects operations after disposal', async () => {
    const { registry, dispose } = await createRegistry()
    await registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })
    await dispose()
    await expect(registry.list()).rejects.toThrow(/disposing/)
  })

  it('closes live connections on disposal', async () => {
    const { registry, dispose } = await createRegistry()
    await registry.addSource({ id: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })
    const adapter = await registry.getAdapter('sample')
    await dispose()
    await expect(adapter.runQuery('SELECT 1', { maxRows: 1 })).rejects.toThrow()
  })
})
