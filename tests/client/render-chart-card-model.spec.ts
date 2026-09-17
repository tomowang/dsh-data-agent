import { describe, expect, it } from 'vitest'
import { renderChartCardModel } from '../../src/client/tool/models/render-chart-card-model.ts'
import type { ToolResultNode } from '../../src/client/tool/tool-view-types.ts'

function settled(overrides: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result',
    callId: 'call-1',
    call: { name: 'da_render_chart', argsRaw: '{}' },
    content: [],
    isError: false,
    ...overrides,
  }
}

describe('renderChartCardModel', () => {
  it('returns null for a running (unsettled) call', () => {
    expect(renderChartCardModel({ callId: 'call-1', name: 'da_render_chart', argsRaw: '{}' })).toBeNull()
  })

  it('returns null for an error result', () => {
    expect(renderChartCardModel(settled({ isError: true }))).toBeNull()
  })

  it('returns null for an unrecognized chart type', () => {
    const meta = {
      type: 'scatter', x: 'status', y: 'n', rowCount: 1, truncated: false,
      columns: [{ name: 'status' }, { name: 'n' }], rows: [{ status: 'paid', n: 1 }],
    }
    expect(renderChartCardModel(settled({ meta }))).toBeNull()
  })

  it('parses a well-formed bar chart with a single y column', () => {
    const meta = {
      type: 'bar', x: 'status', y: 'n', rowCount: 2, truncated: false,
      columns: [{ name: 'status' }, { name: 'n' }],
      rows: [{ status: 'paid', n: 1 }, { status: 'pending', n: 1 }],
    }
    expect(renderChartCardModel(settled({ meta }))).toEqual({
      chart: { type: 'bar', x: 'status', y: 'n' },
      columns: meta.columns,
      rows: meta.rows,
      rowCount: meta.rowCount,
      truncated: meta.truncated,
    })
  })

  it('parses a well-formed line chart with multiple y columns', () => {
    const meta = {
      type: 'line', x: 'day', y: ['a', 'b'], rowCount: 1, truncated: false,
      columns: [{ name: 'day' }, { name: 'a' }, { name: 'b' }],
      rows: [{ day: '2026-09-01', a: 1, b: 2 }],
    }
    expect(renderChartCardModel(settled({ meta }))?.chart).toEqual({ type: 'line', x: 'day', y: ['a', 'b'] })
  })
})
