import { describe, expect, it } from 'vitest'
import { runSqlCardModel } from '../../src/client/tool/models/run-sql-card-model.ts'
import type { ToolResultNode } from '../../src/client/tool/tool-view-types.ts'

function settled(overrides: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result',
    callId: 'call-1',
    call: { name: 'run_sql', argsRaw: '{}' },
    content: [],
    isError: false,
    ...overrides,
  }
}

describe('runSqlCardModel', () => {
  it('returns null for a running (unsettled) call', () => {
    expect(runSqlCardModel({ callId: 'call-1', name: 'run_sql', argsRaw: '{}' })).toBeNull()
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

  it('parses a well-formed result with no chart', () => {
    const meta = {
      sourceName: 'sample', sql: 'SELECT 1 AS x', rowCount: 1, truncated: false,
      columns: [{ name: 'x' }], rows: [{ x: 1 }],
    }
    expect(runSqlCardModel(settled({ meta }))).toEqual({ ...meta, chart: undefined })
  })

  it('parses a well-formed result with a bar chart', () => {
    const meta = {
      sourceName: 'sample', sql: 'SELECT status, COUNT(*) AS n FROM orders GROUP BY status',
      rowCount: 2, truncated: false,
      columns: [{ name: 'status' }, { name: 'n' }],
      rows: [{ status: 'paid', n: 1 }, { status: 'pending', n: 1 }],
      chart: { type: 'bar', x: 'status', y: 'n' },
    }
    expect(runSqlCardModel(settled({ meta }))?.chart).toEqual({ type: 'bar', x: 'status', y: 'n' })
  })

  it('drops an unrecognized chart type without failing the whole card', () => {
    const meta = {
      sourceName: 'sample', sql: 'SELECT 1 AS x', rowCount: 1, truncated: false,
      columns: [{ name: 'x' }], rows: [{ x: 1 }],
      chart: { type: 'scatter', x: 'x', y: 'x' },
    }
    expect(runSqlCardModel(settled({ meta }))?.chart).toBeUndefined()
  })
})
