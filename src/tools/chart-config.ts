import type { ChartType } from './chart-spec.ts'

/**
 * Deliberately NOT typed against chart.js's own `ChartConfiguration` — that
 * type's fields (tooltip/legend callbacks, `canvas`/`ctx` refs) pull in DOM
 * globals the Host half's `tsconfig.json` (`lib: ["es2024"]`, no `"dom"`)
 * doesn't have. This is the plain-object shape chart.js's `new Chart(...)`
 * constructor actually accepts at runtime; both the Client's `<canvas>`
 * renderer and the Host's `skia-canvas` renderer cast it at their own call
 * site, where the right lib config (or `skipLibCheck`) is in scope.
 */
export interface ChartRenderConfig {
  type: 'bar' | 'line' | 'pie'
  data: {
    labels: unknown[]
    datasets: {
      label: string
      data: number[]
      backgroundColor: string | string[]
      borderColor?: string
      stack?: string
      fill?: boolean
    }[]
  }
  options: {
    responsive: boolean
    maintainAspectRatio: boolean
    plugins: { legend: { display: boolean } }
    scales?: { x: { stacked: boolean }, y: { stacked: boolean } }
  }
}

const PALETTE = ['#4f83cc', '#e08e45', '#63a375', '#c2554a', '#8a6fbf', '#c9a13b'] as const

function color(index: number): string {
  return PALETTE[index % PALETTE.length]!
}

/** Builds the chart.js config for a `da_render_chart` spec, shared by the Client's live chart and the Host's static PNG render — the two must draw the same picture. */
export function buildChartConfig(
  type: ChartType,
  x: string,
  y: string | readonly string[],
  rows: readonly Record<string, unknown>[],
): ChartRenderConfig {
  const yColumns = Array.isArray(y) ? y : [y]
  const labels = rows.map(row => row[x])

  if (type === 'pie') {
    const column = yColumns[0]!
    return {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          label: column,
          data: rows.map(row => Number(row[column])),
          backgroundColor: rows.map((_row, index) => color(index)),
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } },
    }
  }

  const stacked = type === 'stacked-bar'
  return {
    type: type === 'line' ? 'line' : 'bar',
    data: {
      labels,
      datasets: yColumns.map((column, index) => ({
        label: column,
        data: rows.map(row => Number(row[column])),
        backgroundColor: color(index),
        borderColor: color(index),
        stack: stacked ? 'stack' : undefined,
        fill: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: stacked ? { x: { stacked: true }, y: { stacked: true } } : undefined,
    },
  }
}
