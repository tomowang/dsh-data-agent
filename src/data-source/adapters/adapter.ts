import type { Context } from '@deepseek-ai/cordis'
import { UNSUPPORTED_ENGINE_CODE, DataAgentError } from '../errors.ts'
import type { DataSourceAdapter, DataSourceRecord, JsonScalar } from '../types.ts'
import { SqliteAdapter } from './sqlite-adapter.ts'
import { MysqlAdapter } from './mysql-adapter.ts'
import { PostgresAdapter } from './postgres-adapter.ts'
import { ClickhouseAdapter } from './clickhouse-adapter.ts'

/** Coerce one driver-returned cell into a JSON-safe scalar. */
export function toJsonScalar(value: unknown): JsonScalar {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
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
