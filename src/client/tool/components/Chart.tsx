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
import type { ChartSpec } from '../models/render-chart-card-model.ts'

const PIE_COLORS = ['#4f83cc', '#e08e45', '#63a375', '#c2554a', '#8a6fbf', '#c9a13b']
const CHART_HEIGHT = 260

export function Chart({ chart, rows }: { chart: ChartSpec, rows: readonly Record<string, unknown>[] }): React.ReactElement {
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
