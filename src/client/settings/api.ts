import type { ConnectionTestResult, DataSourceRecord, SchemaResult } from '../../data-source/types.ts'
import { SETTINGS_API_ROUTE } from '../../settings-api/protocol.ts'

/**
 * Every route is a JSON POST, reads included (see `settings-api/routes.ts`).
 * The URL is document-relative (`api/dsh-data-agent/...`): the harness shell
 * sets `<base href="./">`, so it resolves under whatever mount served the
 * page, including a reverse-proxy subpath. Being same-origin, the request
 * carries the harness's browser-session cookie, which its `/api` channel
 * requires.
 */
async function call<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${SETTINGS_API_ROUTE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  // The harness's own rejections (401/403/413) arrive before our handler and
  // aren't JSON, so parse defensively rather than surface a SyntaxError.
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    payload = undefined
  }
  if (!response.ok) throw new Error(errorMessage(response.status, payload))
  if (payload === undefined) throw new Error(`request failed: the response was not JSON (${response.status})`)
  return payload as T
}

function errorMessage(status: number, payload: unknown): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    return String((payload as { error: unknown }).error)
  }
  if (status === 401) return 'Not signed in to dsh in this browser. Reopen dsh from the URL it printed at startup.'
  if (status === 403) return 'Request refused by dsh (untrusted host or origin).'
  if (status === 413) return 'Request too large.'
  return `request failed (${status})`
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
