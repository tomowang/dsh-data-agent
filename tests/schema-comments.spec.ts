import { describe, expect, it } from 'vitest'
import { mergeSchemaComments } from '../src/data-source/schema-comments.ts'
import type { SchemaResult } from '../src/data-source/types.ts'

describe('mergeSchemaComments', () => {
  it('omits comment/nativeComment keys entirely when there is nothing to show, rather than setting them to undefined', () => {
    const schema: SchemaResult = {
      sourceName: 'src',
      engine: 'postgres',
      scope: 'table',
      truncated: false,
      tables: [
        {
          name: 'orders',
          columnCount: 1,
          columns: [
            { name: 'status', dataType: 'text', nullable: true, isPrimaryKey: false },
          ],
        },
      ],
    }

    const merged = mergeSchemaComments(schema, {})

    expect('comment' in merged.tables[0]!).toBe(false)
    expect('nativeComment' in merged.tables[0]!).toBe(false)
    expect('comment' in merged.tables[0]!.columns![0]!).toBe(false)
    expect('nativeComment' in merged.tables[0]!.columns![0]!).toBe(false)

    // A tool result must be lossless JSON: no explicit `undefined` values survive a round-trip.
    expect(JSON.parse(JSON.stringify(merged))).toEqual(merged)
  })

  it('keeps an overlay comment and demotes a differing native comment to nativeComment', () => {
    const schema: SchemaResult = {
      sourceName: 'src',
      engine: 'postgres',
      scope: 'table',
      truncated: false,
      tables: [
        { name: 'orders', comment: 'native comment', columnCount: 0 },
      ],
    }

    const merged = mergeSchemaComments(schema, { orders: { comment: 'overlay comment' } })

    expect(merged.tables[0]!.comment).toBe('overlay comment')
    expect(merged.tables[0]!.nativeComment).toBe('native comment')
  })
})
