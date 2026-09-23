import type { Context } from '@deepseek-ai/cordis'
import type { Connection as CoreConnection, FieldPacket } from 'mysql2'
import mysql from 'mysql2/promise'
import { resolveSecret } from '../credential.ts'
import { CONNECTION_FAILED_CODE, DataAgentError, TABLE_NOT_FOUND_CODE } from '../errors.ts'
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
import { QUERY_TIMEOUT_MS, toJsonRow } from './adapter.ts'

const DEFAULT_MAX_TABLES = 200
const DEFAULT_MAX_COLUMNS = 1000

interface ColumnRow {
  COLUMN_NAME: string
  DATA_TYPE: string
  IS_NULLABLE: 'YES' | 'NO'
  COLUMN_KEY: string
  COLUMN_COMMENT: string
}

interface TableRow {
  TABLE_NAME: string
  TABLE_COMMENT: string
}

interface StreamedRows {
  rows: Record<string, unknown>[]
  fields: FieldPacket[]
  /** False when reading stopped at `limit` with the rest of the result still unread on the wire. */
  complete: boolean
}

/**
 * Run `sql` on a core (callback-API) connection, collecting at most `limit`
 * rows. A statement with no result set (INSERT/UPDATE/...) emits its OK
 * packet as a `result` before any `fields` — that's not a row, so it's skipped.
 */
function streamRows(connection: CoreConnection, sql: string, values: unknown[], limit: number): Promise<StreamedRows> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = []
    let fields: FieldPacket[] | undefined
    let settled = false
    const query = connection.query({ sql, values, timeout: QUERY_TIMEOUT_MS })
    query.on('fields', (received: FieldPacket[] | undefined) => {
      fields = received ?? []
    })
    query.on('result', (row: unknown) => {
      if (settled || fields === undefined) return
      rows.push(row as Record<string, unknown>)
      if (rows.length >= limit) {
        settled = true
        resolve({ rows, fields, complete: false })
      }
    })
    query.on('error', (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    query.on('end', () => {
      if (settled) return
      settled = true
      resolve({ rows, fields: fields ?? [], complete: true })
    })
  })
}

/** MySQL/MariaDB via `mysql2/promise` — pure JS, no native compilation. */
export class MysqlAdapter implements DataSourceAdapter {
  private poolInstance: mysql.Pool | undefined
  private readonly ctx: Context
  private readonly record: DataSourceRecord

  // No TypeScript parameter-property shorthand — see sqlite-adapter.ts.
  constructor(ctx: Context, record: DataSourceRecord) {
    this.ctx = ctx
    this.record = record
  }

  async connect(): Promise<void> {
    const password = await resolveSecret(this.ctx, this.record.passwordEnv)
    try {
      const pool = mysql.createPool({
        host: this.record.host,
        port: this.record.port,
        user: this.record.user,
        password,
        database: this.record.database,
        ssl: this.record.ssl === true ? {} : undefined,
        connectionLimit: 3,
        supportBigNumbers: true,
        bigNumberStrings: true,
      })
      await pool.query('SELECT 1')
      this.poolInstance = pool
    } catch (error) {
      throw new DataAgentError(
        `Failed to connect to MySQL data source "${this.record.name}": ${(error as Error).message}`,
        CONNECTION_FAILED_CODE,
        { cause: error },
      )
    }
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
    const schemaName = options.schemaName ?? this.record.database
    const maxTables = options.maxTables ?? DEFAULT_MAX_TABLES
    const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS

    if (options.table !== undefined) {
      const [tableRows] = await pool.query<mysql.RowDataPacket[]>(
        'SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [schemaName, options.table],
      )
      if (tableRows.length === 0) {
        throw new DataAgentError(`Table "${options.table}" was not found`, TABLE_NOT_FOUND_CODE)
      }
      const tableRow = tableRows[0] as unknown as TableRow
      return {
        sourceName: this.record.name,
        engine: 'mysql',
        scope: 'table',
        truncated: false,
        tables: [await this.describeTable(schemaName, options.table, tableRow, maxColumns)],
      }
    }

    const [tableRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [schemaName],
    )
    const rows = tableRows as unknown as TableRow[]
    const truncated = rows.length > maxTables
    const limited = rows.slice(0, maxTables)

    const [columnCountRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT TABLE_NAME, COUNT(*) AS columnCount FROM information_schema.columns WHERE TABLE_SCHEMA = ? GROUP BY TABLE_NAME',
      [schemaName],
    )
    const columnCounts = new Map((columnCountRows as unknown as { TABLE_NAME: string, columnCount: string }[])
      .map(row => [row.TABLE_NAME, Number(row.columnCount)]))

    const tables: TableInfo[] = limited.map(row => ({
      name: row.TABLE_NAME,
      ...(row.TABLE_COMMENT.length > 0 ? { comment: row.TABLE_COMMENT } : {}),
      columnCount: columnCounts.get(row.TABLE_NAME) ?? 0,
    }))

    return { sourceName: this.record.name, engine: 'mysql', scope: 'database', tables, truncated }
  }

  /**
   * Streams rows and stops one past `maxRows`. A read-only source runs inside
   * `START TRANSACTION READ ONLY` ... `ROLLBACK`, so MySQL itself rejects any
   * table write the AST gate missed. The connection is destroyed rather than
   * returned to the pool whenever it may be mid-result (stopped early) or in
   * an unknown state (any error, including mysql2's own timeout, which
   * destroys it anyway).
   */
  async runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult> {
    const connection = await this.pool().getConnection()
    let reusable = false
    try {
      if (this.record.readOnly) await connection.query('START TRANSACTION READ ONLY')
      const { rows, fields, complete } = await streamRows(
        // Typed as the promise wrapper, but at runtime mysql2's PromiseConnection
        // keeps the underlying callback-API connection here — the one with row events.
        connection.connection as unknown as CoreConnection,
        sql,
        [...(options.params ?? [])],
        options.maxRows + 1,
      )
      if (this.record.readOnly && complete) await connection.query('ROLLBACK')
      reusable = complete
      const truncated = rows.length > options.maxRows
      const limited = rows.slice(0, options.maxRows).map(toJsonRow)
      const columns = fields.map(field => ({ name: field.name }))
      return { columns, rows: limited, rowCount: limited.length, truncated }
    } finally {
      if (reusable) connection.release()
      else connection.destroy()
    }
  }

  async close(): Promise<void> {
    await this.poolInstance?.end()
  }

  private pool(): mysql.Pool {
    if (this.poolInstance === undefined) {
      throw new DataAgentError('MySQL adapter used before connect()', CONNECTION_FAILED_CODE)
    }
    return this.poolInstance
  }

  private async describeTable(schemaName: string, table: string, tableRow: TableRow, maxColumns: number): Promise<TableInfo> {
    const [columnRows] = await this.pool().query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
       FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [schemaName, table],
    )
    const rows = columnRows as unknown as ColumnRow[]
    const truncated = rows.length > maxColumns
    const columns: ColumnInfo[] = rows.slice(0, maxColumns).map(row => ({
      name: row.COLUMN_NAME,
      dataType: row.DATA_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      isPrimaryKey: row.COLUMN_KEY === 'PRI',
      ...(row.COLUMN_COMMENT.length > 0 ? { comment: row.COLUMN_COMMENT } : {}),
    }))
    return {
      name: table,
      ...(tableRow.TABLE_COMMENT.length > 0 ? { comment: tableRow.TABLE_COMMENT } : {}),
      columnCount: rows.length,
      columns,
      truncated,
    }
  }
}
