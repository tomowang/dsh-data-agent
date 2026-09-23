import { EventEmitter } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { MysqlAdapter } from '../../src/data-source/adapters/mysql-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'

const record: DataSourceRecord = {
  name: 'sample',
  engine: 'mysql',
  database: 'sampledb',
  readOnly: true,
  createdAt: new Date(0).toISOString(),
}

/** Stand in for mysql2's `[rows, fields]` query result, keyed on distinguishing SQL fragments. */
function fakeQuery(sql: string): Promise<[Record<string, unknown>[], unknown]> {
  if (sql.includes('information_schema.tables')) {
    return Promise.resolve([[{ TABLE_NAME: 'orders', TABLE_COMMENT: '' }], undefined])
  }
  if (sql.includes('COUNT(*) AS columnCount')) {
    return Promise.resolve([[{ TABLE_NAME: 'orders', columnCount: 1 }], undefined])
  }
  if (sql.includes('COLUMN_NAME')) {
    return Promise.resolve([[
      { COLUMN_NAME: 'id', DATA_TYPE: 'int', IS_NULLABLE: 'NO', COLUMN_KEY: 'PRI', COLUMN_COMMENT: '' },
    ], undefined])
  }
  throw new Error(`unexpected query: ${sql}`)
}

function adapterWithFakePool(): MysqlAdapter {
  const adapter = new MysqlAdapter(new Context(), record)
  ;(adapter as unknown as { poolInstance: unknown }).poolInstance = { query: fakeQuery }
  return adapter
}

describe('MysqlAdapter.getSchema', () => {
  it('omits comment/nativeComment entirely for a table/column with no comment, database scope', async () => {
    const schema = await adapterWithFakePool().getSchema({})
    expect('comment' in schema.tables[0]!).toBe(false)
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema)
  })

  it('omits comment entirely for a table/column with no comment, single-table scope', async () => {
    const schema = await adapterWithFakePool().getSchema({ table: 'orders' })
    expect('comment' in schema.tables[0]!).toBe(false)
    expect('comment' in schema.tables[0]!.columns![0]!).toBe(false)
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema)
  })
})

/** A pool connection whose core connection emits `rows` as a result set, recording what happened to it. */
function fakePoolConnection(rows: Record<string, unknown>[], log: string[]) {
  return {
    query(sql: string) {
      log.push(sql)
      return Promise.resolve([[], []])
    },
    connection: {
      query({ sql }: { sql: string }) {
        log.push(sql)
        const emitter = new EventEmitter()
        queueMicrotask(() => {
          emitter.emit('fields', [{ name: 'id' }])
          for (const row of rows) emitter.emit('result', row)
          emitter.emit('end')
        })
        return emitter
      },
    },
    release: () => log.push('release'),
    destroy: () => log.push('destroy'),
  }
}

function adapterWithFakeConnection(rows: Record<string, unknown>[], log: string[]): MysqlAdapter {
  const adapter = new MysqlAdapter(new Context(), record)
  ;(adapter as unknown as { poolInstance: unknown }).poolInstance = {
    getConnection: () => Promise.resolve(fakePoolConnection(rows, log)),
  }
  return adapter
}

describe('MysqlAdapter.runQuery', () => {
  it('runs a read-only source in a READ ONLY transaction, rolling back and reusing the connection when fully read', async () => {
    const log: string[] = []
    const result = await adapterWithFakeConnection([{ id: 1 }], log).runQuery('SELECT id FROM t', { maxRows: 5 })
    expect(log).toEqual(['START TRANSACTION READ ONLY', 'SELECT id FROM t', 'ROLLBACK', 'release'])
    expect(result).toEqual({ columns: [{ name: 'id' }], rows: [{ id: 1 }], rowCount: 1, truncated: false })
  })

  it('stops one row past maxRows and destroys the connection rather than draining the rest', async () => {
    const log: string[] = []
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    const result = await adapterWithFakeConnection(rows, log).runQuery('SELECT id FROM t', { maxRows: 2 })
    expect(log).toEqual(['START TRANSACTION READ ONLY', 'SELECT id FROM t', 'destroy'])
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }])
    expect(result.truncated).toBe(true)
  })
})
