import * as React from 'react'

const cellStyle: React.CSSProperties = {
  border: '1px solid rgba(128, 128, 128, 0.3)',
  padding: '4px 8px',
  textAlign: 'left',
  fontSize: 12,
}

const headerStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
}

export interface DataTableProps {
  columns: readonly string[]
  rows: readonly Record<string, unknown>[]
}

/** A minimal, dependency-free table — no host design-system import (see AGENTS.md, cross-plugin value imports are forbidden). */
export function DataTable({ columns, rows }: DataTableProps): React.ReactElement {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {columns.map(column => <th key={column} style={headerStyle}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- rows carry no stable id
            <tr key={index}>
              {columns.map(column => <td key={column} style={cellStyle}>{formatCell(row[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
