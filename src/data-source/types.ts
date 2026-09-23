/** The four supported database engines. */
export type Engine = 'mysql' | 'postgres' | 'sqlite' | 'clickhouse'

/**
 * A registered connection, as persisted to `sources.json`. Never carries a
 * raw secret: `passwordEnv` names an environment variable, resolved at
 * connect time (see `credential.ts`).
 */
export interface DataSourceRecord {
  readonly name: string
  readonly engine: Engine
  /** MySQL/PostgreSQL/ClickHouse only. */
  readonly host?: string
  /** MySQL/PostgreSQL/ClickHouse only. */
  readonly port?: number
  /** MySQL/PostgreSQL/ClickHouse: the database name. SQLite: the file path. */
  readonly database: string
  /** MySQL/PostgreSQL/ClickHouse only. */
  readonly user?: string
  /** Name of an environment variable holding the password, never the value itself. */
  readonly passwordEnv?: string
  /** MySQL/ClickHouse only (selects `https://` for ClickHouse's HTTP interface). PostgreSQL uses `sslmode` instead. */
  readonly ssl?: boolean
  /**
   * PostgreSQL only, mirroring libpq's `sslmode`. Defaults to `disable`.
   * `allow`/`prefer` are negotiated: the adapter tries one encryption state
   * and, only if that connection attempt fails outright, retries with the
   * other — a real second connection, not a protocol-level fallback, so it
   * costs a doubled failure latency when the failure is unrelated to
   * encryption (e.g. a bad password). `verify-ca`/`verify-full` also check
   * the server certificate's chain (`verify-full` additionally checks the
   * hostname) — pair either with `sslrootcert` unless the certificate
   * already chains to a CA Node trusts by default.
   */
  readonly sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'
  /** PostgreSQL only. Path to a PEM-encoded CA certificate, read at connect time. */
  readonly sslrootcert?: string
  readonly readOnly: boolean
  readonly description?: string
  readonly createdAt: string
}

/** A JSON-safe scalar a query result cell or bound parameter may hold. */
export type JsonScalar = string | number | boolean | null

export interface ColumnInfo {
  readonly name: string
  readonly dataType: string
  readonly nullable: boolean
  readonly isPrimaryKey: boolean
  readonly comment?: string
  /** Only present when it differs from the resolved `comment` above. */
  readonly nativeComment?: string
}

export interface TableInfo {
  readonly name: string
  readonly schemaName?: string
  readonly comment?: string
  readonly nativeComment?: string
  readonly columnCount: number
  /** Present only for a single-table `da_get_schema` call. */
  readonly columns?: readonly ColumnInfo[]
  readonly truncated?: boolean
}

export interface SchemaResult {
  readonly sourceName: string
  readonly engine: Engine
  readonly scope: 'database' | 'table'
  readonly tables: readonly TableInfo[]
  readonly truncated: boolean
}

export interface QueryColumn {
  readonly name: string
  readonly dataType?: string
}

export type QueryRow = Record<string, JsonScalar>

export interface QueryResult {
  readonly columns: readonly QueryColumn[]
  readonly rows: readonly QueryRow[]
  /**
   * Rows fetched (== `rows.length`). Adapters stop reading one row past
   * `maxRows`, so a truncated result's true size is unknown — only that
   * more rows exist (`truncated`).
   */
  readonly rowCount: number
  readonly truncated: boolean
}

export interface ConnectionTestResult {
  readonly ok: boolean
  readonly latencyMs?: number
  readonly error?: { readonly code: string, readonly message: string }
}

export interface GetSchemaOptions {
  readonly table?: string
  readonly schemaName?: string
  readonly maxTables?: number
  readonly maxColumns?: number
}

export interface RunQueryOptions {
  readonly params?: readonly JsonScalar[]
  readonly maxRows: number
}

/**
 * One connected data source's driver-facing operations. One implementation
 * per engine (`adapters/`); a plain factory switch selects among them — three
 * fixed engines need no service/DI seam of their own.
 */
export interface DataSourceAdapter {
  connect(): Promise<void>
  testConnection(): Promise<ConnectionTestResult>
  getSchema(options: GetSchemaOptions): Promise<SchemaResult>
  runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult>
  close(): Promise<void>
}
