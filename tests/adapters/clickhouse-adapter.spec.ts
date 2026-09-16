import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ClickhouseAdapter } from '../../src/data-source/adapters/clickhouse-adapter.ts'
import type { DataSourceRecord } from '../../src/data-source/types.ts'

const record: DataSourceRecord = {
  name: 'sample',
  engine: 'clickhouse',
  database: 'sampledb',
  readOnly: true,
  createdAt: new Date(0).toISOString(),
}

/** Stand in for `@clickhouse/client`'s `{ json() }` result set, keyed on distinguishing SQL fragments. */
function fakeQuery({ query }: { query: string }): { json: () => Promise<unknown> } {
  if (query.includes('count() AS columnCount')) {
    return { json: () => Promise.resolve([{ table: 'orders', columnCount: '1' }]) }
  }
  if (query.includes('is_in_primary_key')) {
    return { json: () => Promise.resolve([{ name: 'id', type: 'Int32', comment: '', is_in_primary_key: 1 }]) }
  }
  if (query.includes('system.tables')) {
    return { json: () => Promise.resolve([{ name: 'orders', comment: '' }]) }
  }
  throw new Error(`unexpected query: ${query}`)
}

function adapterWithFakeClient(): ClickhouseAdapter {
  const adapter = new ClickhouseAdapter(new Context(), record)
  ;(adapter as unknown as { clientInstance: unknown }).clientInstance = { query: fakeQuery }
  return adapter
}

describe('ClickhouseAdapter.getSchema', () => {
  it('omits comment entirely for a table with no comment, database scope', async () => {
    const schema = await adapterWithFakeClient().getSchema({})
    expect('comment' in schema.tables[0]!).toBe(false)
    expect(schema.tables[0]!.columnCount).toBe(1)
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema)
  })

  it('omits comment entirely for a table/column with no comment, single-table scope', async () => {
    const schema = await adapterWithFakeClient().getSchema({ table: 'orders' })
    expect('comment' in schema.tables[0]!).toBe(false)
    expect('comment' in schema.tables[0]!.columns![0]!).toBe(false)
    expect(schema.tables[0]!.columns![0]!.isPrimaryKey).toBe(true)
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema)
  })
})

describe('ClickhouseAdapter.getSchema nullable detection', () => {
  it('treats a Nullable(...) column, including a LowCardinality-wrapped one, as nullable', async () => {
    const adapter = new ClickhouseAdapter(new Context(), record)
    ;(adapter as unknown as { clientInstance: unknown }).clientInstance = {
      query: ({ query }: { query: string }) => {
        if (query.includes('is_in_primary_key')) {
          return {
            json: () => Promise.resolve([
              { name: 'id', type: 'Int32', comment: '', is_in_primary_key: 1 },
              { name: 'label', type: 'LowCardinality(Nullable(String))', comment: '', is_in_primary_key: 0 },
            ]),
          }
        }
        return { json: () => Promise.resolve([{ name: 'orders', comment: '' }]) }
      },
    }
    const schema = await adapter.getSchema({ table: 'orders' })
    const columns = schema.tables[0]!.columns!
    expect(columns.find(c => c.name === 'id')!.nullable).toBe(false)
    expect(columns.find(c => c.name === 'label')!.nullable).toBe(true)
  })
})
