import type { JsonScalar, QueryColumn, QueryRow } from '../data-source/types.ts'
import { ToolInputError } from './tool-types.ts'

export const CHART_TYPES = ['bar', 'stacked-bar', 'line', 'pie'] as const
export type ChartType = (typeof CHART_TYPES)[number]

/** Columns are derived from row shape (inline `data`), not declared up front, so x/y are validated after the fact. */
export function assertAxesInColumns(toolName: string, columns: readonly QueryColumn[], x: string, y: string | readonly string[]): void {
  const names = new Set(columns.map(column => column.name))
  for (const column of [x, ...(Array.isArray(y) ? y : [y])]) {
    if (!names.has(column)) {
      throw new ToolInputError(`${toolName}: chart column "${column}" is not among the result's columns (${[...names].join(', ')})`)
    }
  }
}

function isJsonScalar(value: unknown): value is JsonScalar {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** Validates inline chart `data` and derives its columns from the first row's key order. */
export function parseInlineData(toolName: string, raw: unknown): { columns: QueryColumn[], rows: QueryRow[] } {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ToolInputError(`${toolName}: "data" must be a non-empty array of row objects`)
  }
  const rows: QueryRow[] = []
  for (const row of raw) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new ToolInputError(`${toolName}: every "data" entry must be an object`)
    }
    const record = row as Record<string, unknown>
    for (const value of Object.values(record)) {
      if (!isJsonScalar(value)) {
        throw new ToolInputError(`${toolName}: "data" values must be string, number, boolean, or null`)
      }
    }
    rows.push(record as QueryRow)
  }
  const columns = Object.keys(rows[0]!).map(name => ({ name }))
  return { columns, rows }
}
