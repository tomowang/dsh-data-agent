import type { Context } from '@deepseek-ai/cordis'
import { UNSUPPORTED_ENGINE_CODE, DataAgentError } from '../errors.ts'
import type { DataSourceAdapter, DataSourceRecord, JsonScalar } from '../types.ts'
import { SqliteAdapter } from './sqlite-adapter.ts'
import { MysqlAdapter } from './mysql-adapter.ts'
import { PostgresAdapter } from './postgres-adapter.ts'
import { ClickhouseAdapter } from './clickhouse-adapter.ts'

/**
 * Per-query time limit for the network engines, enforced by the server
 * (PostgreSQL `statement_timeout`) or the driver (MySQL/ClickHouse). Not
 * deployment-configurable, same as run-sql's `HARD_MAX_ROWS`: an unbounded
 * query is a stability invariant, not a preference. SQLite has no equivalent —
 * `node:sqlite` runs synchronously with no interrupt hook.
 */
export const QUERY_TIMEOUT_MS = 30_000

let queryTimeoutMs = QUERY_TIMEOUT_MS

/** The per-query time limit in effect — `QUERY_TIMEOUT_MS` outside tests. Read when a connection opens (PostgreSQL/ClickHouse) or a query starts (MySQL). */
export function getQueryTimeoutMs(): number {
  return queryTimeoutMs
}

/** Test-only seam: lets the integration suite exercise timeouts in about a second rather than 30. Not wired to any config. */
export function setQueryTimeoutMsForTesting(ms: number): void {
  queryTimeoutMs = ms
}

/** Coerce one driver-returned cell into a JSON-safe scalar. */
export function toJsonScalar(value: unknown): JsonScalar {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  // A JSON/JSONB column arrives already parsed (pg, mysql2); String() would
  // flatten it to "[object Object]". Re-serialize it instead.
  if (typeof value === 'object') {
    return JSON.stringify(value, (_key, inner: unknown) => typeof inner === 'bigint' ? inner.toString() : inner)
  }
  return String(value)
}

/** Coerce every cell of a driver-returned row into JSON-safe scalars. */
export function toJsonRow(row: Record<string, unknown>): Record<string, JsonScalar> {
  const result: Record<string, JsonScalar> = {}
  for (const [key, value] of Object.entries(row)) result[key] = toJsonScalar(value)
  return result
}

/** One factory point for the four fixed engines — no seam/DI ceremony needed for a closed set. */
export async function createAdapter(ctx: Context, record: DataSourceRecord): Promise<DataSourceAdapter> {
  switch (record.engine) {
    case 'sqlite':
      return new SqliteAdapter(record)
    case 'mysql':
      return new MysqlAdapter(ctx, record)
    case 'postgres':
      return new PostgresAdapter(ctx, record)
    case 'clickhouse':
      return new ClickhouseAdapter(ctx, record)
    default: {
      const unreachable: never = record.engine
      throw new DataAgentError(`Unsupported engine: ${String(unreachable)}`, UNSUPPORTED_ENGINE_CODE)
    }
  }
}
