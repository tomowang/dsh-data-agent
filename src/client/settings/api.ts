import type { ConnectionTestResult, DataSourceRecord, SchemaResult } from '../../data-source/types.ts'

/**
 * Document-relative, not `/dsh-data-agent/api`: the harness shell sets
 * `<base href="./">`, so this resolves under whatever mount served the page —
 * the origin root, or a reverse-proxy subpath such as `/tools/dsh/` that
 * forwards `/tools/dsh/...` as `/...`. An origin-absolute path would skip the
 * mount and miss. The Host still registers the absolute path (see
 * `settings-api/routes.ts`), which is what a request reaches once the proxy
 * strips its prefix.
 */
export const API_ROUTE = 'dsh-data-agent/api'

/** Every route is a JSON POST, reads included — the Host requires it (see `settings-api/routes.ts`). */
async function call<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_ROUTE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export function listSources(): Promise<{ sources: DataSourceRecord[] }> {
  return call('list-sources')
}

export interface AddSourceInput {
  name: string
  engine: 'mysql' | 'postgres' | 'sqlite' | 'clickhouse'
  database: string
  host?: string
  port?: number
  user?: string
  passwordEnv?: string
  ssl?: boolean
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'
  sslrootcert?: string
  readOnly: boolean
  description?: string
}

export function addSource(input: AddSourceInput): Promise<DataSourceRecord> {
  return call('add-source', input)
}

/**
 * Patch for `editSource`. `name` and `engine` aren't editable — see
 * `EditSourceInput` in `src/data-source/registry.ts`. Every other field is a
 * three-way patch: omit to leave unchanged, `null` to clear, a value to set.
 */
export interface EditSourceInput {
  host?: string | null
  port?: number | null
  database?: string
  user?: string | null
  passwordEnv?: string | null
  ssl?: boolean | null
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full' | null
  sslrootcert?: string | null
  readOnly?: boolean
  description?: string | null
}

export function editSource(name: string, input: EditSourceInput): Promise<DataSourceRecord> {
  return call('edit-source', { name, ...input })
}

export function removeSource(name: string): Promise<{ name: string, found: boolean }> {
  return call('remove-source', { name })
}

export function testConnection(name: string): Promise<ConnectionTestResult> {
  return call('test-connection', { name })
}

export function setReadOnly(name: string, readOnly: boolean): Promise<DataSourceRecord> {
  return call('set-read-only', { name, readOnly })
}

export function getSchema(sourceName: string, table?: string): Promise<SchemaResult> {
  return call('get-schema', { sourceName, table })
}

export function setComment(sourceName: string, table: string, column: string | undefined, comment: string | null): Promise<void> {
  return call('set-comment', { sourceName, table, column, comment: comment ?? '' })
}

export interface ToolSummary {
  name: string
  description: string
}

export function listTools(): Promise<{ tools: ToolSummary[] }> {
  return call('list-tools')
}
