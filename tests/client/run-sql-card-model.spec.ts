import { describe, expect, it } from 'vitest'
import { runSqlCardModel } from '../../src/client/tool/models/run-sql-card-model.ts'
import type { ToolResultNode } from '../../src/client/tool/tool-view-types.ts'

function settled(overrides: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result',
    callId: 'call-1',
    call: { name: 'da_run_sql', argsRaw: '{}' },
    content: [],
    isError: false,
    ...overrides,
  }
}

describe('runSqlCardModel', () => {
  it('returns null for a running (unsettled) call', () => {
    expect(runSqlCardModel({ callId: 'call-1', name: 'da_run_sql', argsRaw: '{}' })).toBeNull()
  })

  it('returns null for an error result', () => {
    expect(runSqlCardModel(settled({ isError: true }))).toBeNull()
  })

  it('returns null when a row contains a non-scalar value', () => {
    const meta = {
      sourceName: 'sample', sql: 'SELECT 1', rowCount: 1, truncated: false,
      columns: [{ name: 'x' }], rows: [{ x: { nested: true } }],
    }
    expect(runSqlCardModel(settled({ meta }))).toBeNull()
  })

  it('parses a well-formed result', () => {
    const meta = {
      sourceName: 'sample', sql: 'SELECT 1 AS x', rowCount: 1, truncated: false,
      columns: [{ name: 'x' }], rows: [{ x: 1 }],
    }
    expect(runSqlCardModel(settled({ meta }))).toEqual(meta)
  })
})
