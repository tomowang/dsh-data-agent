import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QUERY_TIMEOUT_MS, setQueryTimeoutMsForTesting } from '../../src/data-source/adapters/adapter.ts'
import { SqliteAdapter } from '../../src/data-source/adapters/sqlite-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'

let dir: string
let dbFile: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-data-agent-sqlite-'))
  dbFile = join(dir, 'sample.db')
  const seed = new DatabaseSync(dbFile)
  seed.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);
    INSERT INTO customers (id, name, email) VALUES (1, 'Ada', 'ada@example.com'), (2, 'Grace', NULL);
  `)
  seed.close()
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function record(overrides: Partial<DataSourceRecord> = {}): DataSourceRecord {
  return {
    name: 'sample',
    engine: 'sqlite',
    database: dbFile,
    readOnly: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('SqliteAdapter', () => {
  it('reports database-level schema with column counts', async () => {
    const adapter = new SqliteAdapter(record())
    await adapter.connect()
    const schema = await adapter.getSchema({})
    expect(schema.scope).toBe('database')
    expect(schema.tables).toEqual([{ name: 'customers', columnCount: 3 }])
    await adapter.close()
  })

  it('reports table-level schema with column detail', async () => {
    const adapter = new SqliteAdapter(record())
    await adapter.connect()
    const schema = await adapter.getSchema({ table: 'customers' })
    expect(schema.scope).toBe('table')
    expect(schema.tables[0]?.columns).toEqual([
      // SQLite's own PRAGMA table_info reports INTEGER PRIMARY KEY (the ROWID
      // alias) as nullable even though it behaves as NOT NULL in practice.
      { name: 'id', dataType: 'INTEGER', nullable: true, isPrimaryKey: true },
      { name: 'name', dataType: 'TEXT', nullable: false, isPrimaryKey: false },
      { name: 'email', dataType: 'TEXT', nullable: true, isPrimaryKey: false },
    ])
    await adapter.close()
  })

  it('throws a TABLE_NOT_FOUND error for an unknown table', async () => {
    const adapter = new SqliteAdapter(record())
    await adapter.connect()
    await expect(adapter.getSchema({ table: 'missing' })).rejects.toThrow(/was not found/)
    await adapter.close()
  })

  it('runs a query and coerces null cells to JSON-safe values', async () => {
    const adapter = new SqliteAdapter(record())
    await adapter.connect()
    const result = await adapter.runQuery('SELECT * FROM customers ORDER BY id', { maxRows: 500 })
    expect(result.rowCount).toBe(2)
    expect(result.truncated).toBe(false)
    expect(result.rows[1]).toEqual({ id: 2, name: 'Grace', email: null })
    await adapter.close()
  })

  it('stops reading past maxRows, reporting the rows returned and that more exist', async () => {
    const adapter = new SqliteAdapter(record())
    await adapter.connect()
    const result = await adapter.runQuery('SELECT * FROM customers ORDER BY id', { maxRows: 1 })
    expect(result.rows).toHaveLength(1)
    expect(result.rowCount).toBe(1)
    expect(result.truncated).toBe(true)
    await adapter.close()
  })

  it('opens read-only sources OS-level read-only, rejecting a write statement', async () => {
    const adapter = new SqliteAdapter(record({ readOnly: true }))
    await adapter.connect()
    await expect(
      adapter.runQuery('INSERT INTO customers (id, name) VALUES (3, \'Hopper\')', { maxRows: 1 }),
    ).rejects.toThrow()
    await adapter.close()
  })

  it('allows writes when readOnly is false', async () => {
    const adapter = new SqliteAdapter(record({ readOnly: false }))
    await adapter.connect()
    await adapter.runQuery('INSERT INTO customers (id, name) VALUES (3, \'Hopper\')', { maxRows: 1 })
    const result = await adapter.runQuery('SELECT COUNT(*) AS n FROM customers', { maxRows: 1 })
    expect(result.rows).toEqual([{ n: 3 }])
    await adapter.close()
  })

  describe('runaway queries', () => {
    const runaway = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) AS n FROM c'

    afterEach(() => setQueryTimeoutMsForTesting(QUERY_TIMEOUT_MS))

    it('stops a query past the time limit without blocking this process, then reconnects', async () => {
      setQueryTimeoutMsForTesting(500)
      const adapter = new SqliteAdapter(record())
      await adapter.connect()

      let ticks = 0
      const ticker = setInterval(() => { ticks++ }, 50)
      try {
        await expect(adapter.runQuery(runaway, { maxRows: 1 })).rejects.toThrow(/time limit/)
      } finally {
        clearInterval(ticker)
      }
      // The event loop kept running while the query did.
      expect(ticks).toBeGreaterThan(3)

      const result = await adapter.runQuery('SELECT COUNT(*) AS n FROM customers', { maxRows: 1 })
      expect(result.rows).toEqual([{ n: 2 }])
      await adapter.close()
    })

    it('closes while a query is running, failing that query', async () => {
      const adapter = new SqliteAdapter(record())
      await adapter.connect()
      const running = expect(adapter.runQuery(runaway, { maxRows: 1 })).rejects.toThrow(/closed/)
      await new Promise(resolve => setTimeout(resolve, 100))
      await adapter.close()
      await running
    })
  })
})
