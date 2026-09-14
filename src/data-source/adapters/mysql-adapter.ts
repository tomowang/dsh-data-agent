import type { Context } from '@deepseek-ai/cordis'
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
import { toJsonRow } from './adapter.ts'

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
        `Failed to connect to MySQL data source "${this.record.id}": ${(error as Error).message}`,
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
        sourceId: this.record.id,
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
    const columnCounts = new Map((columnCountRows as unknown as { TABLE_NAME: string, columnCount: number }[])
      .map(row => [row.TABLE_NAME, row.columnCount]))

    const tables: TableInfo[] = limited.map(row => ({
      name: row.TABLE_NAME,
      comment: row.TABLE_COMMENT.length > 0 ? row.TABLE_COMMENT : undefined,
      columnCount: columnCounts.get(row.TABLE_NAME) ?? 0,
    }))

    return { sourceId: this.record.id, engine: 'mysql', scope: 'database', tables, truncated }
  }

  async runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult> {
    const [rows, fields] = await this.pool().query(sql, [...(options.params ?? [])])
    const rowArray = rows as Record<string, unknown>[]
    const truncated = rowArray.length > options.maxRows
    const limited = rowArray.slice(0, options.maxRows).map(toJsonRow)
    const columns = (fields ?? []).map(field => ({ name: field.name }))
    return { columns, rows: limited, rowCount: rowArray.length, truncated }
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
      comment: row.COLUMN_COMMENT.length > 0 ? row.COLUMN_COMMENT : undefined,
    }))
    return {
      name: table,
      comment: tableRow.TABLE_COMMENT.length > 0 ? tableRow.TABLE_COMMENT : undefined,
      columnCount: rows.length,
      columns,
      truncated,
    }
  }
}
