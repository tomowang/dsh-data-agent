import type { DataSourceRecord } from '../data-source/types.ts'

/** A `DataSourceRecord` with everything but `passwordEnv`'s *name* — never a secret to begin with. */
export type SafeDataSourceRecord = DataSourceRecord

/**
 * The one place a `DataSourceRecord` becomes tool output. `passwordEnv` is
 * always safe to echo — it names an environment variable, never a value —
 * but funneling every tool through this one function means "never leak a
 * secret" has exactly one implementation to audit.
 */
export function toSafeRecord(record: DataSourceRecord): SafeDataSourceRecord {
  return record
}

/**
 * Render rows as a GFM Markdown table, capped at `limit` rows with a truncation
 * note. `truncated` means more rows exist beyond `totalRowCount` (the query
 * stopped reading at its row cap), shown as "N+".
 */
export function renderMarkdownTable(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  options: { limit: number, totalRowCount: number, truncated?: boolean },
): string {
  if (columns.length === 0) return '(no columns)'
  const header = `| ${columns.join(' | ')} |`
  const divider = `| ${columns.map(() => '---').join(' | ')} |`
  const shown = rows.slice(0, options.limit)
  const body = shown.map(row => `| ${columns.map(column => formatCell(row[column])).join(' | ')} |`)
  const table = [header, divider, ...body].join('\n')
  if (options.truncated === true) {
    return `${table}\n\n_(showing first ${shown.length} of ${options.totalRowCount}+ rows — the result was capped)_`
  }
  if (options.totalRowCount <= shown.length) return table
  return `${table}\n\n_(showing first ${shown.length} of ${options.totalRowCount} rows)_`
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}
