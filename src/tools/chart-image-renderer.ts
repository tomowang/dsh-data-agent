import { Canvas } from 'skia-canvas'
import { Chart, registerables, type ChartConfiguration } from 'chart.js'
import type { ChartRenderConfig } from './chart-config.ts'

Chart.register(...registerables)

const IMAGE_WIDTH = 800
const IMAGE_HEIGHT = 450

/** Rasterizes a `ChartRenderConfig` to a PNG buffer via `skia-canvas`, chart.js's own supported route for server-side rendering (it falls back to a DOM-free "basic platform" whenever `window` is undefined). */
export async function renderChartImage(config: ChartRenderConfig): Promise<Buffer> {
  const canvas = new Canvas(IMAGE_WIDTH, IMAGE_HEIGHT)
  const context = canvas.getContext('2d')
  // `context as any`: skia-canvas's 2D context is structurally what chart.js expects, but naming
  // that DOM type here would need the "dom" lib this Host-side file doesn't have (see chart-config.ts).
  const chart = new Chart(
    context as any,
    {
      ...config,
      options: { ...config.options, responsive: false, animation: false, devicePixelRatio: 1 },
    } as unknown as ChartConfiguration,
  )
  try {
    return await canvas.toBuffer('png')
  } finally {
    chart.destroy()
  }
}
