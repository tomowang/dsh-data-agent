import type { ConnectionTestResult, DataSourceRecord, SchemaResult } from '../../data-source/types.ts'

const BASE = '/dsh-data-agent/api'

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  engine: 'mysql' | 'postgres' | 'sqlite'
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
