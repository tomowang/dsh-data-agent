import { Context } from '@deepseek-ai/cordis'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { QUERY_TIMEOUT_MS, setQueryTimeoutMsForTesting } from '../../src/data-source/adapters/adapter.ts'
import { PostgresAdapter } from '../../src/data-source/adapters/postgres-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'
import { DATABASE, engineEnabled, HOOK_TIMEOUT_MS, HOST, password, retry, ROW_COUNT, sourceRecord } from './helpers.ts'

const PORT = Number(process.env.DSH_DA_IT_PG_PORT ?? 5432)
const USER = 'postgres'

describe.skipIf(!engineEnabled('postgres'))('PostgreSQL adapter against a real server', () => {
  const opened: PostgresAdapter[] = []

  async function open(overrides: Partial<DataSourceRecord> = {}): Promise<PostgresAdapter> {
    const adapter = new PostgresAdapter(new Context(), sourceRecord('postgres', { port: PORT, user: USER, ...overrides }))
    await adapter.connect()
    opened.push(adapter)
    return adapter
  }

  beforeAll(async () => {
    const admin = await retry(async () => {
      const client = new pg.Client({ host: HOST, port: PORT, user: USER, password: password(), database: DATABASE })
      await client.connect()
      return client
    })
    await admin.query(`
      DROP TABLE IF EXISTS items, items_copy;
      DROP SEQUENCE IF EXISTS seq;
      CREATE TABLE items (
        id int PRIMARY KEY, label text NOT NULL, big bigint NOT NULL, created timestamptz NOT NULL, doc jsonb NOT NULL
      );
      INSERT INTO items
        SELECT n, 'item ' || n, n * 10000000000::bigint,
               TIMESTAMPTZ '2026-01-01 00:00:00+00' + n * INTERVAL '1 minute', jsonb_build_object('n', n)
        FROM generate_series(1, ${ROW_COUNT}) AS n;
      CREATE SEQUENCE seq;
    `)
    await admin.end()
  }, HOOK_TIMEOUT_MS)

  afterEach(() => setQueryTimeoutMsForTesting(QUERY_TIMEOUT_MS))

  afterAll(async () => {
    for (const adapter of opened) await adapter.close()
  })

  it('stops at maxRows, and returns connections to the pool after each early stop', async () => {
    const adapter = await open()
    // More runs than the pool's 3 connections: a leaked connection would hang here.
    for (let run = 0; run < 5; run++) {
      const result = await adapter.runQuery('SELECT id FROM items ORDER BY id', { maxRows: 10 })
      expect(result.rows).toHaveLength(10)
      expect(result.rows[0]).toEqual({ id: 1 })
      expect(result.rowCount).toBe(10)
      expect(result.truncated).toBe(true)
    }
  })

  it('reports an untruncated result when every row fits', async () => {
    const result = await (await open()).runQuery('SELECT id FROM items', { maxRows: 5000 })
    expect(result.rowCount).toBe(ROW_COUNT)
    expect(result.truncated).toBe(false)
  })

  it('has the database reject writes on a read-only source, even SQL the AST gate would miss', async () => {
    const adapter = await open()
    for (const sql of [
      'UPDATE items SET label = \'changed\' WHERE id = 1',
      'SELECT setval(\'seq\', 42)',
      'SELECT * INTO items_copy FROM items',
    ]) {
      await expect(adapter.runQuery(sql, { maxRows: 10 })).rejects.toThrow(/read-only transaction/)
    }
    const check = await adapter.runQuery('SELECT label FROM items WHERE id = 1', { maxRows: 1 })
    expect(check.rows).toEqual([{ label: 'item 1' }])
  })

  it('keeps read-only enforced after a query tries to switch the session default off', async () => {
    const adapter = await open()
    await adapter.runQuery('SELECT set_config(\'default_transaction_read_only\', \'off\', false)', { maxRows: 1 })
    await expect(
      adapter.runQuery('UPDATE items SET label = \'changed\' WHERE id = 1', { maxRows: 1 }),
    ).rejects.toThrow(/read-only transaction/)
  })

  it('runs writes on a read-write source, with and without RETURNING', async () => {
    const adapter = await open({ readOnly: false })
    const inserted = await adapter.runQuery(
      'INSERT INTO items VALUES ($1, $2, 1, now(), \'{}\') RETURNING id',
      { params: [ROW_COUNT + 1, 'new'], maxRows: 10 },
    )
    expect(inserted.rows).toEqual([{ id: ROW_COUNT + 1 }])

    const updated = await adapter.runQuery('UPDATE items SET label = \'renamed\' WHERE id = $1', { params: [ROW_COUNT + 1], maxRows: 10 })
    expect(updated.rows).toEqual([])

    const check = await adapter.runQuery('SELECT label FROM items WHERE id = $1', { params: [ROW_COUNT + 1], maxRows: 1 })
    expect(check.rows).toEqual([{ label: 'renamed' }])
  })

  it('returns bigint, timestamptz, and jsonb cells as JSON-safe scalars', async () => {
    const result = await (await open()).runQuery('SELECT big, created, doc FROM items WHERE id = 2', { maxRows: 1 })
    expect(result.rows).toEqual([{ big: '20000000000', created: '2026-01-01T00:02:00.000Z', doc: '{"n":2}' }])
  })

  it('cancels a query that runs past the time limit', async () => {
    setQueryTimeoutMsForTesting(1000)
    const adapter = await open({ name: 'it-postgres-timeout' })
    await expect(adapter.runQuery('SELECT pg_sleep(5)', { maxRows: 1 })).rejects.toThrow(/statement timeout/)
  })

  it('reads table and column detail', async () => {
    const schema = await (await open()).getSchema({ table: 'items' })
    expect(schema.tables[0]!.columns!.map(column => column.name)).toEqual(['id', 'label', 'big', 'created', 'doc'])
    expect(schema.tables[0]!.columns![0]!.isPrimaryKey).toBe(true)
  })
})
