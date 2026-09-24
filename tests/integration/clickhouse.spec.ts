import { createClient } from '@clickhouse/client'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { QUERY_TIMEOUT_MS, setQueryTimeoutMsForTesting } from '../../src/data-source/adapters/adapter.ts'
import { ClickhouseAdapter } from '../../src/data-source/adapters/clickhouse-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'
import { DATABASE, engineEnabled, HOOK_TIMEOUT_MS, HOST, password, retry, ROW_COUNT, sourceRecord } from './helpers.ts'

const PORT = Number(process.env.DSH_DA_IT_CLICKHOUSE_PORT ?? 8123)
const USER = 'default'
/** A second account whose own profile is `readonly=1` — the adapter re-sending `readonly=1` must not break it. */
const READONLY_USER = 'it_readonly'

describe.skipIf(!engineEnabled('clickhouse'))('ClickHouse adapter against a real server', () => {
  const opened: ClickhouseAdapter[] = []

  async function open(overrides: Partial<DataSourceRecord> = {}): Promise<ClickhouseAdapter> {
    const adapter = new ClickhouseAdapter(new Context(), sourceRecord('clickhouse', { port: PORT, user: USER, ...overrides }))
    await adapter.connect()
    opened.push(adapter)
    return adapter
  }

  beforeAll(async () => {
    // No `database` on the admin client: it creates the database itself, then qualifies every name.
    const admin = createClient({ url: `http://${HOST}:${PORT}`, username: USER, password: password() })
    await retry(() => admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${DATABASE}` }))
    for (const query of [
      `DROP TABLE IF EXISTS ${DATABASE}.items`,
      `CREATE TABLE ${DATABASE}.items (
        id UInt32, label String, big UInt64, created DateTime('UTC'), doc String
      ) ENGINE = MergeTree ORDER BY id`,
      `INSERT INTO ${DATABASE}.items
        SELECT number + 1, concat('item ', toString(number + 1)), (number + 1) * 10000000000,
               toDateTime('2026-01-01 00:00:00', 'UTC') + (number + 1) * 60,
               concat('{"n":', toString(number + 1), '}')
        FROM numbers(${ROW_COUNT})`,
      `CREATE USER IF NOT EXISTS ${READONLY_USER} IDENTIFIED WITH plaintext_password BY '${password()}' SETTINGS readonly = 1`,
      `GRANT SELECT ON ${DATABASE}.* TO ${READONLY_USER}`,
    ]) {
      await admin.command({ query })
    }
    await admin.close()
  }, HOOK_TIMEOUT_MS)

  afterEach(() => setQueryTimeoutMsForTesting(QUERY_TIMEOUT_MS))

  afterAll(async () => {
    for (const adapter of opened) await adapter.close()
  })

  it('stops at maxRows, and the client keeps working after each aborted response', async () => {
    const adapter = await open()
    // More runs than the client's 3 sockets: a leaked socket would hang here.
    for (let run = 0; run < 5; run++) {
      const result = await adapter.runQuery('SELECT id FROM items ORDER BY id', { maxRows: 10 })
      expect(result.rows).toHaveLength(10)
      expect(result.rows[0]).toEqual({ id: 1 })
      expect(result.columns).toEqual([{ name: 'id', dataType: 'UInt32' }])
      expect(result.truncated).toBe(true)
    }
  })

  it('reports an untruncated result when every row fits', async () => {
    const result = await (await open()).runQuery('SELECT id FROM items', { maxRows: 5000 })
    expect(result.rowCount).toBe(ROW_COUNT)
    expect(result.truncated).toBe(false)
  })

  it('runs a read-only source under readonly=1, so the server refuses even a settings change', async () => {
    const adapter = await open()
    await expect(
      adapter.runQuery('SELECT 1 SETTINGS max_threads = 1', { maxRows: 1 }),
    ).rejects.toThrow(/readonly/i)
  })

  it('works for a user whose own profile is already readonly=1', async () => {
    const adapter = await open({ name: 'it-clickhouse-ro-user', user: READONLY_USER })
    const result = await adapter.runQuery('SELECT count() AS n FROM items', { maxRows: 1 })
    expect(result.rows).toEqual([{ n: String(ROW_COUNT) }])
  })

  it('runs writes on a read-write source', async () => {
    const adapter = await open({ readOnly: false })
    await adapter.runQuery(`INSERT INTO items SELECT ${ROW_COUNT + 1}, 'new', 1, now(), '{}'`, { maxRows: 10 })
    const check = await adapter.runQuery(`SELECT label FROM items WHERE id = ${ROW_COUNT + 1}`, { maxRows: 1 })
    expect(check.rows).toEqual([{ label: 'new' }])
  })

  it('returns UInt64 and DateTime cells as JSON-safe scalars', async () => {
    const result = await (await open()).runQuery('SELECT big, created, doc FROM items WHERE id = 2', { maxRows: 1 })
    expect(result.rows).toEqual([{ big: '20000000000', created: '2026-01-01 00:02:00', doc: '{"n":2}' }])
  })

  it('returns 64-bit integers exactly, as strings, even beyond 2^53', async () => {
    const result = await (await open()).runQuery(
      'SELECT toUInt64(18446744073709551615) AS max_u64, toInt64(-9007199254740993) AS below_safe, toUInt8(7) AS small',
      { maxRows: 1 },
    )
    expect(result.rows).toEqual([{ max_u64: '18446744073709551615', below_safe: '-9007199254740993', small: 7 }])
  })

  it('abandons a query that runs past the time limit', async () => {
    setQueryTimeoutMsForTesting(1000)
    const adapter = await open({ name: 'it-clickhouse-timeout' })
    await expect(adapter.runQuery('SELECT sleep(3)', { maxRows: 1 })).rejects.toThrow(/timeout/i)
  })

  it('reads table and column detail', async () => {
    const schema = await (await open()).getSchema({ table: 'items' })
    expect(schema.tables[0]!.columns!.map(column => column.name)).toEqual(['id', 'label', 'big', 'created', 'doc'])
  })
})
