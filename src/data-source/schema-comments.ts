import type { ColumnInfo, SchemaResult, TableInfo } from './types.ts'

interface TableComments {
  comment?: string
  columns?: Record<string, string>
}

/** comments.json wins over a native comment; a differing native comment is kept as `nativeComment`. */
function mergeComment(overlay: string | undefined, native: string | undefined): Pick<TableInfo, 'comment' | 'nativeComment'> {
  const comment = overlay ?? native
  const nativeComment = native !== undefined && native !== comment ? native : undefined
  return { comment, ...(nativeComment !== undefined ? { nativeComment } : {}) }
}

function mergeTable(table: TableInfo, comments: Record<string, TableComments>): TableInfo {
  const overlay = comments[table.name]
  const tableComment = mergeComment(overlay?.comment, table.comment)
  const columns = table.columns?.map((column: ColumnInfo) => ({
    ...column,
    ...mergeComment(overlay?.columns?.[column.name], column.comment),
  }))
  return { ...table, ...tableComment, ...(columns !== undefined ? { columns } : {}) }
}

/**
 * Merge persisted comments.json entries into an adapter's raw schema result.
 * Shared by the get_schema tool and the Settings-page schema route so both
 * callers of `DataSourceRegistry`/adapters present identical comment
 * resolution, with exactly one implementation to keep correct.
 */
export function mergeSchemaComments(schema: SchemaResult, comments: Record<string, TableComments>): SchemaResult {
  return { ...schema, tables: schema.tables.map(table => mergeTable(table, comments)) }
}
