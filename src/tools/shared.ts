import type { DataSourceRecord } from '../data-source/types.ts'
import { ToolInputError } from './tool-types.ts'

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
 * Chat tools never attach credentials: the model's inputs can be steered by
 * prompt injection (e.g. text stored in a table it just read), and a
 * credential plus a host of the attacker's choosing is an exfiltration
 * channel. Only the Settings page — a human at the UI — sets `passwordEnv`.
 */
export function rejectChatCredentials(args: Record<string, unknown>, toolName: string): void {
  if (args.passwordEnv !== undefined) {
    throw new ToolInputError(
      `${toolName}: "passwordEnv" cannot be set from chat. Ask the user to set the password environment variable `
      + 'for this source in Settings → Data Sources.',
    )
  }
}

/** Connection fields that decide where (and how securely) a source's password is sent. */
const CREDENTIAL_TARGET_FIELDS = ['host', 'port', 'user', 'ssl', 'sslmode', 'sslrootcert'] as const

/**
 * For a source that already has a `passwordEnv`, reject a chat edit that would
 * send its password somewhere else (host/port), to a different account
 * (user), or less securely (ssl/sslmode/sslrootcert). Re-sending a field's
 * current value is allowed, so a model echoing the whole record back is fine.
 */
export function assertNotRetargetingCredentials(
  existing: DataSourceRecord,
  patch: Partial<Record<(typeof CREDENTIAL_TARGET_FIELDS)[number], unknown>>,
  toolName: string,
): void {
  if (existing.passwordEnv === undefined) return
  const changed = CREDENTIAL_TARGET_FIELDS.filter((key) => {
    const value = patch[key]
    return value !== undefined && (value ?? undefined) !== existing[key]
  })
  if (changed.length > 0) {
    throw new ToolInputError(
      `${toolName}: "${existing.name}" has a saved credential, so its ${changed.join(', ')} can only be changed in `
      + 'Settings → Data Sources, not from chat.',
    )
  }
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
