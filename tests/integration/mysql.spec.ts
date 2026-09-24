import { Context } from '@deepseek-ai/cordis'
import mysql from 'mysql2/promise'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { QUERY_TIMEOUT_MS, setQueryTimeoutMsForTesting } from '../../src/data-source/adapters/adapter.ts'
import { MysqlAdapter } from '../../src/data-source/adapters/mysql-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'
import { DATABASE, engineEnabled, HOOK_TIMEOUT_MS, HOST, password, retry, ROW_COUNT, seededTimestamp, sourceRecord } from './helpers.ts'

const PORT = Number(process.env.DSH_DA_IT_MYSQL_PORT ?? 3306)
const USER = 'root'

/** `YYYY-MM-DD HH:MM:SS`, the literal form DATETIME takes. */
function datetimeLiteral(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

// Covers MySQL and MariaDB alike — CI runs this file once per server image.
describe.skipIf(!engineEnabled('mysql'))('MySQL/MariaDB adapter against a real server', () => {
  const opened: MysqlAdapter[] = []

  async function open(overrides: Partial<DataSourceRecord> = {}): Promise<MysqlAdapter> {
    const adapter = new MysqlAdapter(new Context(), sourceRecord('mysql', { port: PORT, user: USER, ...overrides }))
    await adapter.connect()
    opened.push(adapter)
    return adapter
  }

  beforeAll(async () => {
    const admin = await retry(() => mysql.createConnection({ host: HOST, port: PORT, user: USER, password: password(), database: DATABASE }))
    await admin.query('DROP TABLE IF EXISTS items')
    await admin.query(`CREATE TABLE items (
      id INT PRIMARY KEY, label VARCHAR(50) NOT NULL, big BIGINT NOT NULL, created DATETIME NOT NULL, doc JSON NOT NULL
    )`)
    const rows = Array.from({ length: ROW_COUNT }, (_, index) => {
      const n = index + 1
      return [n, `item ${n}`, n * 10_000_000_000, datetimeLiteral(seededTimestamp(n)), JSON.stringify({ n })]
    })
    await admin.query('INSERT INTO items VALUES ?', [rows])
    await admin.end()
  }, HOOK_TIMEOUT_MS)

  afterEach(() => setQueryTimeoutMsForTesting(QUERY_TIMEOUT_MS))

  afterAll(async () => {
    for (const adapter of opened) await adapter.close()
  })

  it('stops at maxRows, and the pool keeps working after each early stop discards its connection', async () => {
    const adapter = await open()
    // More runs than the pool's 3 connections: a leaked connection would hang here.
    for (let run = 0; run < 5; run++) {
      const result = await adapter.runQuery('SELECT id FROM items ORDER BY id', { maxRows: 10 })
      expect(result.rows).toHaveLength(10)
      expect(result.rows[0]).toEqual({ id: 1 })
      expect(result.truncated).toBe(true)
    }
  })

  it('reports an untruncated result when every row fits', async () => {
    const result = await (await open()).runQuery('SELECT id FROM items', { maxRows: 5000 })
    expect(result.rowCount).toBe(ROW_COUNT)
    expect(result.truncated).toBe(false)
  })

  it('has the database reject writes on a read-only source, even when sent straight to the adapter', async () => {
    const adapter = await open()
    await expect(
      adapter.runQuery('UPDATE items SET label = \'changed\' WHERE id = 1', { maxRows: 10 }),
    ).rejects.toThrow(/READ ONLY transaction/i)
    const check = await adapter.runQuery('SELECT label FROM items WHERE id = 1', { maxRows: 1 })
    expect(check.rows).toEqual([{ label: 'item 1' }])
  })

  it('runs writes on a read-write source, returning no rows rather than the OK packet', async () => {
    const adapter = await open({ readOnly: false })
    const inserted = await adapter.runQuery(
      'INSERT INTO items VALUES (?, ?, 1, NOW(), \'{}\')',
      { params: [ROW_COUNT + 1, 'new'], maxRows: 10 },
    )
    expect(inserted.rows).toEqual([])
    expect(inserted.columns).toEqual([])

    const check = await adapter.runQuery('SELECT label FROM items WHERE id = ?', { params: [ROW_COUNT + 1], maxRows: 1 })
    expect(check.rows).toEqual([{ label: 'new' }])
  })

  it('returns BIGINT, DATETIME, and JSON cells as JSON-safe scalars', async () => {
    const result = await (await open()).runQuery('SELECT big, created, doc FROM items WHERE id = 2', { maxRows: 1 })
    const row = result.rows[0]!
    expect(row.big).toBe('20000000000')
    // mysql2 reads DATETIME in the process's local time zone, so only the shape is stable across machines.
    expect(row.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    // MySQL's JSON arrives parsed and is re-serialized; MariaDB's JSON is LONGTEXT and arrives as-is.
    expect(JSON.parse(row.doc as string)).toEqual({ n: 2 })
  })

  it('abandons a query that runs past the time limit', async () => {
    setQueryTimeoutMsForTesting(1000)
    const adapter = await open({ name: 'it-mysql-timeout' })
    await expect(adapter.runQuery('SELECT SLEEP(5)', { maxRows: 1 })).rejects.toThrow(/timeout/i)
  })

  it('reads table and column detail', async () => {
    const schema = await (await open()).getSchema({ table: 'items' })
    expect(schema.tables[0]!.columns!.map(column => column.name)).toEqual(['id', 'label', 'big', 'created', 'doc'])
    expect(schema.tables[0]!.columns![0]!.isPrimaryKey).toBe(true)
  })
})
