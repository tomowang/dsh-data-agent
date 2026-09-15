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
