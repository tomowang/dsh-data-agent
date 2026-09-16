import { describe, expect, it } from 'vitest'
import { getSchemaCardModel } from '../../src/client/tool/models/get-schema-card-model.ts'
import type { ToolResultNode } from '../../src/client/tool/tool-view-types.ts'

function settled(overrides: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result',
    callId: 'call-1',
    call: { name: 'da_get_schema', argsRaw: '{}' },
    content: [],
    isError: false,
    ...overrides,
  }
}

describe('getSchemaCardModel', () => {
  it('returns null for a running (unsettled) call', () => {
    expect(getSchemaCardModel({ callId: 'call-1', name: 'da_get_schema', argsRaw: '{}' })).toBeNull()
  })

  it('returns null for an error result', () => {
    expect(getSchemaCardModel(settled({ isError: true }))).toBeNull()
  })

  it('returns null when meta is missing', () => {
    expect(getSchemaCardModel(settled())).toBeNull()
  })

  it('returns null when meta is structurally malformed', () => {
    expect(getSchemaCardModel(settled({ meta: { sourceName: 'x' } }))).toBeNull()
  })

  it('parses a well-formed database-scope schema', () => {
    const meta = {
      sourceName: 'sample',
      engine: 'sqlite',
      scope: 'database',
      truncated: false,
      tables: [{ name: 'orders', columnCount: 3 }],
    }
    expect(getSchemaCardModel(settled({ meta }))).toEqual(meta)
  })

  it('parses a well-formed table-scope schema with columns', () => {
    const meta = {
      sourceName: 'sample',
      engine: 'sqlite',
      scope: 'table',
      truncated: false,
      tables: [{
        name: 'orders',
        columnCount: 1,
        columns: [{ name: 'id', dataType: 'INTEGER', nullable: false, isPrimaryKey: true }],
      }],
    }
    expect(getSchemaCardModel(settled({ meta }))).toEqual(meta)
  })

  it('rejects a table entry with a malformed column', () => {
    const meta = {
      sourceName: 'sample',
      engine: 'sqlite',
      scope: 'table',
      truncated: false,
      tables: [{ name: 'orders', columnCount: 1, columns: [{ name: 'id' }] }],
    }
    expect(getSchemaCardModel(settled({ meta }))).toBeNull()
  })
})
