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
