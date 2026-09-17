import { describe, expect, it } from 'vitest'
import { buildChartConfig } from '../src/tools/chart-config.ts'

const rows = [
  { month: 'Jan', revenue: 10, cost: 4 },
  { month: 'Feb', revenue: 20, cost: 8 },
]

describe('buildChartConfig', () => {
  it('builds a single-series bar config', () => {
    const config = buildChartConfig('bar', 'month', 'revenue', rows)
    expect(config.type).toBe('bar')
    expect(config.data.labels).toEqual(['Jan', 'Feb'])
    expect(config.data.datasets).toEqual([
      { label: 'revenue', data: [10, 20], backgroundColor: '#4f83cc', borderColor: '#4f83cc', stack: undefined, fill: false },
    ])
    expect(config.options.scales).toBeUndefined()
  })

  it('builds a multi-series stacked-bar config with stacked scales', () => {
    const config = buildChartConfig('stacked-bar', 'month', ['revenue', 'cost'], rows)
    expect(config.type).toBe('bar')
    expect(config.data.datasets).toHaveLength(2)
    expect(config.data.datasets.every(dataset => dataset.stack === 'stack')).toBe(true)
    expect(config.options.scales).toEqual({ x: { stacked: true }, y: { stacked: true } })
  })

  it('builds a line config for multiple series', () => {
    const config = buildChartConfig('line', 'month', ['revenue', 'cost'], rows)
    expect(config.type).toBe('line')
    expect(config.data.datasets.map(dataset => dataset.label)).toEqual(['revenue', 'cost'])
  })

  it('builds a pie config from the first y column, one color per row', () => {
    const config = buildChartConfig('pie', 'month', ['revenue', 'cost'], rows)
    expect(config.type).toBe('pie')
    expect(config.data.datasets).toEqual([
      { label: 'revenue', data: [10, 20], backgroundColor: ['#4f83cc', '#e08e45'] },
    ])
  })
})
