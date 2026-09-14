import type { ColumnInfo, SchemaResult, TableInfo } from '../../../data-source/types.ts'
import { isSettled, type ToolCallBlock } from '../tool-view-types.ts'

function isColumnInfo(value: unknown): value is ColumnInfo {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.name === 'string'
    && typeof record.dataType === 'string'
    && typeof record.nullable === 'boolean'
    && typeof record.isPrimaryKey === 'boolean'
}

function isTableInfo(value: unknown): value is TableInfo {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || typeof record.columnCount !== 'number') return false
  if (record.columns !== undefined && (!Array.isArray(record.columns) || !record.columns.every(isColumnInfo))) {
    return false
  }
  return true
}

/**
 * Pure derivation of `get_schema`'s card props from `block.meta`. Never
 * trusts the raw wire value without full structural validation — this runs
 * on session-log replay of arbitrary historical data, not just live results.
 * Returns `null` for anything malformed or not yet settled, falling back to
 * the generic card.
 */
export function getSchemaCardModel(block: ToolCallBlock): SchemaResult | null {
  if (!isSettled(block) || block.isError) return null
  const meta = block.meta
  if (typeof meta !== 'object' || meta === null) return null
  const record = meta as Record<string, unknown>

  if (
    typeof record.sourceId !== 'string'
    || typeof record.engine !== 'string'
    || (record.scope !== 'database' && record.scope !== 'table')
    || typeof record.truncated !== 'boolean'
    || !Array.isArray(record.tables)
    || !record.tables.every(isTableInfo)
  ) {
    return null
  }

  return record as unknown as SchemaResult
}
