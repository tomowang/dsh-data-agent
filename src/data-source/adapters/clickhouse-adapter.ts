import type { Context } from '@deepseek-ai/cordis'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
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
const DEFAULT_HTTP_PORT = 8123
const DEFAULT_HTTPS_PORT = 8443

interface ColumnRow {
  name: string
  type: string
  comment: string
  is_in_primary_key: number
}

interface TableRow {
  name: string
  comment: string
}

/**
 * ClickHouse via the official `@clickhouse/client` HTTP client. Schema
 * introspection reads `system.tables`/`system.columns` (ClickHouse has no
 * `information_schema` table-comment support worth relying on across
 * versions). `?`/`$1`-style positional binding has no ClickHouse equivalent —
 * the HTTP interface only binds named `{name:Type}` parameters embedded in
 * the query text — so `runQuery` maps a positional `params` array onto `p1`,
 * `p2`, ... and callers reference `{p1:Type}` etc. in the SQL itself.
 */
export class ClickhouseAdapter implements DataSourceAdapter {
  private clientInstance: ClickHouseClient | undefined
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
      const client = createClient({
        url: this.url(),
        username: this.record.user,
        password,
        database: this.record.database,
        max_open_connections: 3,
      })
      await (await client.query({ query: 'SELECT 1', format: 'JSONEachRow' })).json()
      this.clientInstance = client
    } catch (error) {
      throw new DataAgentError(
        `Failed to connect to ClickHouse data source "${this.record.name}": ${(error as Error).message}`,
        CONNECTION_FAILED_CODE,
        { cause: error },
      )
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now()
    try {
      await (await this.client().query({ query: 'SELECT 1', format: 'JSONEachRow' })).json()
      return { ok: true, latencyMs: Math.round(performance.now() - start) }
    } catch (error) {
      return { ok: false, error: { code: CONNECTION_FAILED_CODE, message: (error as Error).message } }
    }
  }

  async getSchema(options: GetSchemaOptions): Promise<SchemaResult> {
    const client = this.client()
    const database = options.schemaName ?? this.record.database
    const maxTables = options.maxTables ?? DEFAULT_MAX_TABLES
    const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS

    if (options.table !== undefined) {
      const tableRows = await (await client.query({
        query: 'SELECT name, comment FROM system.tables WHERE database = {database:String} AND name = {table:String}',
        format: 'JSONEachRow',
        query_params: { database, table: options.table },
      })).json<TableRow>()
      const tableRow = tableRows[0]
      if (tableRow === undefined) {
        throw new DataAgentError(`Table "${options.table}" was not found`, TABLE_NOT_FOUND_CODE)
      }
      return {
        sourceName: this.record.name,
        engine: 'clickhouse',
        scope: 'table',
        truncated: false,
        tables: [await this.describeTable(database, options.table, tableRow, maxColumns)],
      }
    }

    const tableRows = await (await client.query({
      query: 'SELECT name, comment FROM system.tables WHERE database = {database:String} ORDER BY name',
      format: 'JSONEachRow',
      query_params: { database },
    })).json<TableRow>()
    const truncated = tableRows.length > maxTables
    const limited = tableRows.slice(0, maxTables)

    const columnCountRows = await (await client.query({
      query: 'SELECT table, count() AS columnCount FROM system.columns WHERE database = {database:String} GROUP BY table',
      format: 'JSONEachRow',
      query_params: { database },
    })).json<{ table: string, columnCount: string | number }>()
    const columnCounts = new Map(columnCountRows.map(row => [row.table, Number(row.columnCount)]))

    const tables: TableInfo[] = limited.map(row => ({
      name: row.name,
      ...(row.comment.length > 0 ? { comment: row.comment } : {}),
      columnCount: columnCounts.get(row.name) ?? 0,
    }))

    return { sourceName: this.record.name, engine: 'clickhouse', scope: 'database', tables, truncated }
  }

  // The client always appends `FORMAT JSON` to `sql` itself (needed for row/column
  // metadata) — a `FORMAT` clause already in `sql` would collide and ClickHouse
  // would reject the statement, but `sql/classify.ts` already rejects `FORMAT`
  // as unparseable syntax before a query reaches here.
  async runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult> {
    const query_params = options.params === undefined
      ? undefined
      : Object.fromEntries(options.params.map((value, index) => [`p${index + 1}`, value]))
    const response = await (await this.client().query({ query: sql, format: 'JSON', query_params })).json<Record<string, unknown>>()
    const rowArray = response.data
    const truncated = rowArray.length > options.maxRows
    const limited = rowArray.slice(0, options.maxRows).map(toJsonRow)
    const columns = (response.meta ?? []).map(field => ({ name: field.name, dataType: field.type }))
    return { columns, rows: limited, rowCount: rowArray.length, truncated }
  }

  async close(): Promise<void> {
    await this.clientInstance?.close()
  }

  private client(): ClickHouseClient {
    if (this.clientInstance === undefined) {
      throw new DataAgentError('ClickHouse adapter used before connect()', CONNECTION_FAILED_CODE)
    }
    return this.clientInstance
  }

  /** Builds the client's HTTP(S) URL from `host`/`port`/`ssl` — the client takes a URL, not discrete fields. */
  private url(): string {
    const scheme = this.record.ssl === true ? 'https' : 'http'
    const host = this.record.host ?? 'localhost'
    const port = this.record.port ?? (this.record.ssl === true ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT)
    return `${scheme}://${host}:${port}`
  }

  private async describeTable(database: string, table: string, tableRow: TableRow, maxColumns: number): Promise<TableInfo> {
    const columnRows = await (await this.client().query({
      query: 'SELECT name, type, comment, is_in_primary_key FROM system.columns WHERE database = {database:String} AND table = {table:String} ORDER BY position',
      format: 'JSONEachRow',
      query_params: { database, table },
    })).json<ColumnRow>()
    const truncated = columnRows.length > maxColumns
    const columns: ColumnInfo[] = columnRows.slice(0, maxColumns).map(row => ({
      name: row.name,
      dataType: row.type,
      // LowCardinality(Nullable(T)) still wraps a Nullable() layer, hence a substring check rather than a prefix check.
      nullable: row.type.includes('Nullable('),
      isPrimaryKey: row.is_in_primary_key === 1,
      ...(row.comment.length > 0 ? { comment: row.comment } : {}),
    }))
    return {
      name: table,
      ...(tableRow.comment.length > 0 ? { comment: tableRow.comment } : {}),
      columnCount: columnRows.length,
      columns,
      truncated,
    }
  }
}
