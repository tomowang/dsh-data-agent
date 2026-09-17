import * as React from 'react'
import { Chart } from './Chart.tsx'
import { DataTable } from './DataTable.tsx'
import { renderChartCardModel } from '../models/render-chart-card-model.ts'
import { fallbackText, type ToolRowProps } from '../tool-view-types.ts'

/**
 * `da_render_chart` Chat card. Claiming this key suppresses the generic
 * fallback for every `da_render_chart` result, so this component must cover
 * every shape: running, error, and malformed/legacy `meta` all render as
 * plain text.
 */
export function RenderChartRow({ block }: ToolRowProps): React.ReactElement {
  const result = renderChartCardModel(block)
  if (result === null) {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{fallbackText(block)}</div>
  }

  return (
    <div>
      <Chart chart={result.chart} rows={result.rows} />
      <DataTable columns={result.columns.map(column => column.name)} rows={result.rows} />
      {result.truncated && (
        <p style={{ fontSize: 12, opacity: 0.7 }}>(showing {result.rows.length} of {result.rowCount} rows)</p>
      )}
    </div>
  )
}
