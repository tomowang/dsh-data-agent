import { DatabaseSync } from 'node:sqlite'
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

/** Double-quote a SQLite identifier for interpolation (PRAGMA takes no bound parameters). */
function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/**
 * SQLite via Node's built-in `node:sqlite` (confirmed available, no native
 * compilation) — the only engine with a second, OS-level read-only guarantee
 * on top of the AST gate (`sql/classify.ts`), and the only engine with no
 * native column/table comments (hence `comments.json` as an engine-agnostic
 * overlay).
 */
export class SqliteAdapter implements DataSourceAdapter {
  private db: DatabaseSync | undefined
  private readonly record: DataSourceRecord

  // TypeScript parameter-property shorthand is intentionally avoided
  // throughout this plugin: the real `dsh` CLI loads out-of-tree plugin
  // source through Node's native type-stripping ("strip-only mode"), which
  // errors on parameter properties since they require actual code
  // generation, not just type erasure. Verified directly against a real
  // `dsh --profile web` boot, not assumed.
  constructor(record: DataSourceRecord) {
    this.record = record
  }

  async connect(): Promise<void> {
    try {
      this.db = new DatabaseSync(this.record.database, { readOnly: this.record.readOnly })
    } catch (error) {
      throw new DataAgentError(
        `Failed to open SQLite database at "${this.record.database}": ${(error as Error).message}`,
        CONNECTION_FAILED_CODE,
        { cause: error },
      )
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now()
    try {
      this.database().prepare('SELECT 1').get()
      return { ok: true, latencyMs: Math.round(performance.now() - start) }
    } catch (error) {
      return { ok: false, error: { code: CONNECTION_FAILED_CODE, message: (error as Error).message } }
    }
  }

  async getSchema(options: GetSchemaOptions): Promise<SchemaResult> {
    const db = this.database()
    const maxTables = options.maxTables ?? DEFAULT_MAX_TABLES
    const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS

    if (options.table !== undefined) {
      const exists = db
        .prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?')
        .get(options.table)
      if (exists === undefined) {
        throw new DataAgentError(`Table "${options.table}" was not found`, TABLE_NOT_FOUND_CODE)
      }
      return {
        sourceName: this.record.name,
        engine: 'sqlite',
        scope: 'table',
        truncated: false,
        tables: [this.describeTable(options.table, maxColumns)],
      }
    }

    const rows = db
      .prepare('SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name')
      .all() as { name: string }[]
    const truncated = rows.length > maxTables
    const tables: TableInfo[] = rows.slice(0, maxTables).map((row) => {
      const columnCount = (db.prepare(`PRAGMA table_info(${quoteIdentifier(row.name)})`).all()).length
      return { name: row.name, columnCount }
    })

    return { sourceName: this.record.name, engine: 'sqlite', scope: 'database', tables, truncated }
  }

  async runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult> {
    const db = this.database()
    const stmt = db.prepare(sql)
    const params = (options.params ?? []) as (string | number | null)[]
    const rows = stmt.all(...params) as Record<string, unknown>[]
    const truncated = rows.length > options.maxRows
    const limited = rows.slice(0, options.maxRows).map(toJsonRow)
    const columns = stmt.columns().map(column => ({ name: column.name }))
    return { columns, rows: limited, rowCount: rows.length, truncated }
  }

  async close(): Promise<void> {
    this.db?.close()
  }

  private database(): DatabaseSync {
    if (this.db === undefined) {
      throw new DataAgentError('SQLite adapter used before connect()', CONNECTION_FAILED_CODE)
    }
    return this.db
  }

  private describeTable(table: string, maxColumns: number): TableInfo {
    const db = this.database()
    const pragmaRows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as {
      name: string
      type: string
      notnull: number
      pk: number
    }[]
    const truncated = pragmaRows.length > maxColumns
    const columns: ColumnInfo[] = pragmaRows.slice(0, maxColumns).map(row => ({
      name: row.name,
      dataType: row.type,
      nullable: row.notnull === 0,
      isPrimaryKey: row.pk > 0,
    }))
    return { name: table, columnCount: pragmaRows.length, columns, truncated }
  }
}
