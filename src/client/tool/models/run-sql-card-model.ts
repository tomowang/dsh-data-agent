import type { JsonScalar, QueryColumn } from '../../../data-source/types.ts'
import { isSettled, type ToolCallBlock } from '../tool-view-types.ts'

const CHART_TYPES = new Set(['bar', 'line', 'pie'])

export interface RunSqlChart {
  type: 'bar' | 'line' | 'pie'
  x: string
  y: string | string[]
}

export interface RunSqlCardModel {
  sourceId: string
  sql: string
  columns: readonly QueryColumn[]
  rows: readonly Record<string, JsonScalar>[]
  rowCount: number
  truncated: boolean
  chart?: RunSqlChart
}

function isQueryColumn(value: unknown): value is QueryColumn {
  return typeof value === 'object' && value !== null && typeof (value as { name?: unknown }).name === 'string'
}

function isJsonScalar(value: unknown): value is JsonScalar {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isRow(value: unknown): value is Record<string, JsonScalar> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isJsonScalar)
}

function parseChart(value: unknown): RunSqlChart | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.type !== 'string' || !CHART_TYPES.has(record.type)) return undefined
  if (typeof record.x !== 'string') return undefined
  const y = record.y
  if (typeof y !== 'string' && !(Array.isArray(y) && y.every(entry => typeof entry === 'string'))) return undefined
  return { type: record.type as RunSqlChart['type'], x: record.x, y }
}

/**
 * Pure derivation of `run_sql`'s card props from `block.meta`. Never trusts
 * the raw wire value without full structural validation (session-log
 * replay). Returns `null` for anything malformed or not yet settled.
 */
export function runSqlCardModel(block: ToolCallBlock): RunSqlCardModel | null {
  if (!isSettled(block) || block.isError) return null
  const meta = block.meta
  if (typeof meta !== 'object' || meta === null) return null
  const record = meta as Record<string, unknown>

  if (
    typeof record.sourceId !== 'string'
    || typeof record.sql !== 'string'
    || typeof record.rowCount !== 'number'
    || typeof record.truncated !== 'boolean'
    || !Array.isArray(record.columns)
    || !record.columns.every(isQueryColumn)
    || !Array.isArray(record.rows)
    || !record.rows.every(isRow)
  ) {
    return null
  }

  return {
    sourceId: record.sourceId,
    sql: record.sql,
    columns: record.columns,
    rows: record.rows,
    rowCount: record.rowCount,
    truncated: record.truncated,
    chart: parseChart(record.chart),
  }
}
