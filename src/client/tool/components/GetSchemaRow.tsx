import * as React from 'react'
import type { SchemaResult, TableInfo } from '../../../data-source/types.ts'
import * as api from '../../settings/api.ts'
import { SchemaTree } from '../../shared/SchemaTree.tsx'
import { getSchemaCardModel } from '../models/get-schema-card-model.ts'
import { fallbackText, type ToolRowProps } from '../tool-view-types.ts'

/**
 * `da_get_schema` Chat card. Claiming this key suppresses the generic fallback
 * for every `da_get_schema` result, so this component must cover every shape:
 * preparing, running, error, and malformed/legacy `meta` all render as plain text.
 */
export function GetSchemaRow({ block }: ToolRowProps): React.ReactElement {
  const initial = getSchemaCardModel(block)
  const [expandedTables, setExpandedTables] = React.useState<Record<string, TableInfo>>({})
  const [loadingTables, setLoadingTables] = React.useState<Set<string>>(new Set())

  if (initial === null) {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{fallbackText(block)}</div>
  }

  const schema: SchemaResult = {
    ...initial,
    tables: initial.tables.map(table => expandedTables[table.name] ?? table),
  }

  // A row's `columns` starts undefined for the database-scope list this card
  // renders; expanding it lazily fetches that one table's detail via the same
  // Settings-API route the Data Sources panel uses (DataSourcesPanel.tsx),
  // rather than shipping every table's full column list up front.
  const expandTable = async (table: string): Promise<void> => {
    setLoadingTables(prev => new Set(prev).add(table))
    try {
      const detail = await api.getSchema(schema.sourceName, table)
      const expandedTable = detail.tables[0]
      if (expandedTable === undefined) return
      setExpandedTables(prev => ({ ...prev, [table]: expandedTable }))
    } finally {
      setLoadingTables((prev) => {
        const next = new Set(prev)
        next.delete(table)
        return next
      })
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{schema.sourceName} ({schema.engine})</div>
      <SchemaTree schema={schema} onExpandTable={table => void expandTable(table)} loadingTables={loadingTables} />
    </div>
  )
}
