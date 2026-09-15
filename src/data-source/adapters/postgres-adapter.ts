import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import pg from 'pg'
import { resolveSecret } from '../credential.ts'
import { CONNECTION_FAILED_CODE, DataAgentError, TABLE_NOT_FOUND_CODE } from '../errors.ts'
import { resolvePostgresSslAttempts } from './postgres-ssl.ts'
import type {
  ColumnInfo,
  ConnectionTestResult,
  DataSourceAdapter,
  DataSourceRecord,
  GetSchemaOptions,
  QueryResult,
  RunQueryOptions,
  SchemaResult,
  TableInfo,
} from '../types.ts'
import { toJsonRow } from './adapter.ts'

const DEFAULT_MAX_TABLES = 200
const DEFAULT_MAX_COLUMNS = 1000
const DEFAULT_SCHEMA = 'public'

interface ColumnRow {
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
  is_primary_key: boolean
  comment: string | null
}

interface TableRow {
  table_name: string
  comment: string | null
}

/** PostgreSQL via `pg` — pure JS, no native compilation. */
export class PostgresAdapter implements DataSourceAdapter {
  private poolInstance: pg.Pool | undefined
  private readonly ctx: Context
  private readonly record: DataSourceRecord

  // No TypeScript parameter-property shorthand — see sqlite-adapter.ts.
  constructor(ctx: Context, record: DataSourceRecord) {
    this.ctx = ctx
    this.record = record
  }

  async connect(): Promise<void> {
    const password = await resolveSecret(this.ctx, this.record.passwordEnv)
    const attempts = resolvePostgresSslAttempts(this.record, path => readFileSync(path, 'utf8'))

    let lastError: unknown
    for (const ssl of attempts) {
      const pool = new pg.Pool({
        host: this.record.host,
        port: this.record.port,
        user: this.record.user,
        password,
        database: this.record.database,
        ssl,
        max: 3,
      })
      try {
        await pool.query('SELECT 1')
        this.poolInstance = pool
        return
      } catch (error) {
        lastError = error
        // `allow`/`prefer` only get here on a second, negotiated attempt —
        // never leave the failed first pool's sockets open while retrying.
        await pool.end().catch(() => {})
      }
    }

    throw new DataAgentError(
      `Failed to connect to PostgreSQL data source "${this.record.id}": ${(lastError as Error).message}`,
      CONNECTION_FAILED_CODE,
      { cause: lastError },
    )
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now()
    try {
      await this.pool().query('SELECT 1')
      return { ok: true, latencyMs: Math.round(performance.now() - start) }
    } catch (error) {
      return { ok: false, error: { code: CONNECTION_FAILED_CODE, message: (error as Error).message } }
    }
  }

  async getSchema(options: GetSchemaOptions): Promise<SchemaResult> {
    const pool = this.pool()
    const schemaName = options.schemaName ?? DEFAULT_SCHEMA
    const maxTables = options.maxTables ?? DEFAULT_MAX_TABLES
    const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS

    if (options.table !== undefined) {
      const { rows: tableRows } = await pool.query<TableRow>(
        `SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'v', 'm')`,
        [schemaName, options.table],
      )
      const tableRow = tableRows[0]
      if (tableRow === undefined) {
        throw new DataAgentError(`Table "${options.table}" was not found`, TABLE_NOT_FOUND_CODE)
      }
      return {
        sourceId: this.record.id,
        engine: 'postgres',
        scope: 'table',
        truncated: false,
        tables: [await this.describeTable(schemaName, options.table, tableRow, maxColumns)],
      }
    }

    const { rows: tableRows } = await pool.query<TableRow & { column_count: number }>(
      `SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment,
              (SELECT count(*) FROM information_schema.columns col
               WHERE col.table_schema = n.nspname AND col.table_name = c.relname) AS column_count
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'v', 'm')
       ORDER BY c.relname`,
      [schemaName],
    )
    const truncated = tableRows.length > maxTables
    const tables: TableInfo[] = tableRows.slice(0, maxTables).map(row => ({
      name: row.table_name,
      comment: row.comment ?? undefined,
      columnCount: Number(row.column_count),
    }))

    return { sourceId: this.record.id, engine: 'postgres', scope: 'database', tables, truncated }
  }

  async runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult> {
    const result = await this.pool().query(sql, (options.params ?? []) as unknown[])
    const rowArray = result.rows as Record<string, unknown>[]
    const truncated = rowArray.length > options.maxRows
    const limited = rowArray.slice(0, options.maxRows).map(toJsonRow)
    const columns = result.fields.map(field => ({ name: field.name }))
    return { columns, rows: limited, rowCount: rowArray.length, truncated }
  }

  async close(): Promise<void> {
    await this.poolInstance?.end()
  }

  private pool(): pg.Pool {
    if (this.poolInstance === undefined) {
      throw new DataAgentError('PostgreSQL adapter used before connect()', CONNECTION_FAILED_CODE)
    }
    return this.poolInstance
  }

  private async describeTable(schemaName: string, table: string, tableRow: TableRow, maxColumns: number): Promise<TableInfo> {
    const { rows } = await this.pool().query<ColumnRow>(
      `SELECT col.column_name, col.data_type, col.is_nullable,
              (kcu.column_name IS NOT NULL) AS is_primary_key,
              col_description(format('%I.%I', col.table_schema, col.table_name)::regclass::oid, col.ordinal_position) AS comment
       FROM information_schema.columns col
       LEFT JOIN information_schema.table_constraints tc
         ON tc.table_schema = col.table_schema AND tc.table_name = col.table_name AND tc.constraint_type = 'PRIMARY KEY'
       LEFT JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.column_name = col.column_name
       WHERE col.table_schema = $1 AND col.table_name = $2
       ORDER BY col.ordinal_position`,
      [schemaName, table],
    )
    const truncated = rows.length > maxColumns
    const columns: ColumnInfo[] = rows.slice(0, maxColumns).map(row => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_primary_key,
      comment: row.comment ?? undefined,
    }))
    return {
      name: table,
      comment: tableRow.comment ?? undefined,
      columnCount: rows.length,
      columns,
      truncated,
    }
  }
}
