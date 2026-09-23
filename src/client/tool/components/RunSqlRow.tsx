import * as React from 'react'
import { DataTable } from './DataTable.tsx'
import { runSqlCardModel } from '../models/run-sql-card-model.ts'
import { fallbackText, type ToolRowProps } from '../tool-view-types.ts'

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
      <DataTable columns={result.columns.map(column => column.name)} rows={result.rows} />
      {result.truncated && (
        <p style={{ fontSize: 12, opacity: 0.7 }}>(showing {result.rows.length} of {result.rowCount}+ rows)</p>
      )}
    </div>
  )
}
