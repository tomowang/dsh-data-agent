import * as React from 'react'
import { Chart as ChartJS, registerables, type ChartConfiguration } from 'chart.js'
import { buildChartConfig } from '../../../tools/chart-config.ts'
import type { ChartSpec } from '../models/render-chart-card-model.ts'

ChartJS.register(...registerables)

const CHART_HEIGHT = 260

export function Chart({ chart, rows }: { chart: ChartSpec, rows: readonly Record<string, unknown>[] }): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const config = buildChartConfig(chart.type, chart.x, chart.y, rows)
    const instance = new ChartJS(canvas, config as unknown as ChartConfiguration)
    return () => instance.destroy()
  }, [chart, rows])

  return (
    <div style={{ position: 'relative', height: CHART_HEIGHT }}>
      <canvas ref={canvasRef} role="img" aria-label={`${chart.type} chart`} />
    </div>
  )
}
