import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { PostgresAdapter } from '../../src/data-source/adapters/postgres-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'

const record: DataSourceRecord = {
  name: 'sample',
  engine: 'postgres',
  database: 'sampledb',
  readOnly: true,
  createdAt: new Date(0).toISOString(),
}

/** Stand in for `pg`'s `{ rows }` query result, keyed on distinguishing SQL fragments. */
function fakeQuery(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
  if (sql.includes('column_count')) {
    return Promise.resolve({ rows: [{ table_name: 'orders', comment: null, column_count: 1 }] })
  }
  if (sql.includes('col_description')) {
    return Promise.resolve({
      rows: [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO', is_primary_key: true, comment: null }],
    })
  }
  if (sql.includes('obj_description')) {
    return Promise.resolve({ rows: [{ table_name: 'orders', comment: null }] })
  }
  throw new Error(`unexpected query: ${sql}`)
}

function adapterWithFakePool(): PostgresAdapter {
  const adapter = new PostgresAdapter(new Context(), record)
  ;(adapter as unknown as { poolInstance: unknown }).poolInstance = { query: fakeQuery }
  return adapter
}

describe('PostgresAdapter.getSchema', () => {
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

/** A checked-out `pg` client whose cursor serves `rows`, recording every plain query and the cursor read size. */
function fakeClient(rows: Record<string, unknown>[], log: string[]) {
  return {
    query(input: unknown) {
      if (typeof input === 'string') {
        log.push(input)
        return Promise.resolve({ rows: [] })
      }
      return {
        read(limit: number, callback: (error: undefined, rows: unknown[], result: { fields: { name: string }[] }) => void) {
          log.push(`read ${limit}`)
          callback(undefined, rows.slice(0, limit), { fields: [{ name: 'id' }] })
        },
        close: () => Promise.resolve(),
      }
    },
    release(destroy?: boolean) {
      log.push(destroy === true ? 'destroy' : 'release')
    },
  }
}

function adapterWithFakeClient(readOnly: boolean, rows: Record<string, unknown>[], log: string[]): PostgresAdapter {
  const adapter = new PostgresAdapter(new Context(), { ...record, readOnly })
  ;(adapter as unknown as { poolInstance: unknown }).poolInstance = {
    connect: () => Promise.resolve(fakeClient(rows, log)),
  }
  return adapter
}

describe('PostgresAdapter.runQuery', () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('wraps a read-only source\'s query in BEGIN READ ONLY ... ROLLBACK and reads only maxRows + 1 rows', async () => {
    const log: string[] = []
    const result = await adapterWithFakeClient(true, rows, log).runQuery('SELECT id FROM t', { maxRows: 2 })
    expect(log).toEqual(['BEGIN READ ONLY', 'read 3', 'ROLLBACK', 'release'])
    expect(result).toEqual({ columns: [{ name: 'id' }], rows: [{ id: 1 }, { id: 2 }], rowCount: 2, truncated: true })
  })

  it('runs a read-write source\'s query with no transaction wrapper', async () => {
    const log: string[] = []
    const result = await adapterWithFakeClient(false, rows, log).runQuery('SELECT id FROM t', { maxRows: 5 })
    expect(log).toEqual(['read 6', 'release'])
    expect(result.truncated).toBe(false)
    expect(result.rowCount).toBe(3)
  })
})
