import * as React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DataTable } from './DataTable.tsx'
import { runSqlCardModel, type RunSqlChart } from '../models/run-sql-card-model.ts'
import { fallbackText, type ToolRowProps } from '../tool-view-types.ts'

const PIE_COLORS = ['#4f83cc', '#e08e45', '#63a375', '#c2554a', '#8a6fbf', '#c9a13b']
const CHART_HEIGHT = 260

function Chart({ chart, rows }: { chart: RunSqlChart, rows: readonly Record<string, unknown>[] }): React.ReactElement {
  const yColumns = Array.isArray(chart.y) ? chart.y : [chart.y]

  if (chart.type === 'pie') {
    const y = yColumns[0] ?? chart.x
    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart>
          <Pie data={[...rows]} dataKey={y} nameKey={chart.x} outerRadius={90} label>
            {rows.map((_row, index) => (
              // eslint-disable-next-line react/no-array-index-key -- fixed-order palette cycling
              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={[...rows]}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey={chart.x} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {yColumns.map((y, index) => <Bar key={y} dataKey={y} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={[...rows]}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={chart.x} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {yColumns.map((y, index) => <Line key={y} dataKey={y} stroke={PIE_COLORS[index % PIE_COLORS.length]} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * `da_run_sql` Chat card. Claiming this key suppresses the generic fallback for
 * every `da_run_sql` result, so this component must cover every shape: running,
 * error, and malformed/legacy `meta` all render as plain text.
 */
export function RunSqlRow({ block }: ToolRowProps): React.ReactElement {
  const result = runSqlCardModel(block)
  if (result === null) {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{fallbackText(block)}</div>
  }

  return (
    <div>
      {result.chart !== undefined && <Chart chart={result.chart} rows={result.rows} />}
      <DataTable columns={result.columns.map(column => column.name)} rows={result.rows} />
      {result.truncated && (
        <p style={{ fontSize: 12, opacity: 0.7 }}>(showing {result.rows.length} of {result.rowCount} rows)</p>
      )}
    </div>
  )
}
