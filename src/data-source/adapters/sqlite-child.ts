// Child-process half of `SqliteAdapter` (see sqlite-adapter.ts): owns the one
// `DatabaseSync` handle and answers requests over IPC. Only ever run via
// `fork()` — the parent imports this module's types, never its code.
import { DatabaseSync } from 'node:sqlite'
import { DataAgentError, TABLE_NOT_FOUND_CODE } from '../errors.ts'
import type { ColumnInfo, GetSchemaOptions, JsonScalar, QueryColumn, SchemaResult, TableInfo } from '../types.ts'

export type SqliteRequest =
  | { readonly op: 'open', readonly name: string, readonly path: string, readonly readOnly: boolean }
  | { readonly op: 'ping' }
  | { readonly op: 'getSchema', readonly options: GetSchemaOptions }
  | { readonly op: 'runQuery', readonly sql: string, readonly params: readonly JsonScalar[], readonly maxRows: number }

export interface SqliteEnvelope {
  readonly id: number
  readonly request: SqliteRequest
}

export type SqliteResponse =
  | { readonly id: number, readonly ok: true, readonly value: unknown }
  | { readonly id: number, readonly ok: false, readonly message: string, readonly code?: string }

/** `runQuery`'s reply: at most `maxRows + 1` raw driver rows, so the parent can tell whether more exist. */
export interface RawQueryResult {
  readonly columns: readonly QueryColumn[]
  readonly rows: readonly Record<string, unknown>[]
}

const DEFAULT_MAX_TABLES = 200
const DEFAULT_MAX_COLUMNS = 1000

let db: DatabaseSync | undefined
let sourceName = ''

/** Double-quote a SQLite identifier for interpolation (PRAGMA takes no bound parameters). */
function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function database(): DatabaseSync {
  if (db === undefined) throw new Error('SQLite database is not open')
  return db
}

function describeTable(table: string, maxColumns: number): TableInfo {
  const pragmaRows = database().prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as {
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

function getSchema(options: GetSchemaOptions): SchemaResult {
  const maxTables = options.maxTables ?? DEFAULT_MAX_TABLES
  const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS

  if (options.table !== undefined) {
    const exists = database()
      .prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?')
      .get(options.table)
    if (exists === undefined) {
      throw new DataAgentError(`Table "${options.table}" was not found`, TABLE_NOT_FOUND_CODE)
    }
    return {
      sourceName,
      engine: 'sqlite',
      scope: 'table',
      truncated: false,
      tables: [describeTable(options.table, maxColumns)],
    }
  }

  const rows = database()
    .prepare('SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name')
    .all() as { name: string }[]
  const truncated = rows.length > maxTables
  const tables: TableInfo[] = rows.slice(0, maxTables).map((row) => {
    const columnCount = (database().prepare(`PRAGMA table_info(${quoteIdentifier(row.name)})`).all()).length
    return { name: row.name, columnCount }
  })

  return { sourceName, engine: 'sqlite', scope: 'database', tables, truncated }
}

function runQuery(sql: string, params: readonly JsonScalar[], maxRows: number): RawQueryResult {
  const stmt = database().prepare(sql)
  const values = params as (string | number | null)[]
  const columns = stmt.columns().map(column => ({ name: column.name }))
  if (columns.length === 0) {
    stmt.run(...values)
    return { columns, rows: [] }
  }

  // Step one row past the cap, then stop — never materialize the whole result.
  const rows: Record<string, unknown>[] = []
  for (const row of stmt.iterate(...values)) {
    rows.push(row as Record<string, unknown>)
    if (rows.length > maxRows) break
  }
  return { columns, rows }
}

function handle(request: SqliteRequest): unknown {
  switch (request.op) {
    case 'open':
      sourceName = request.name
      db = new DatabaseSync(request.path, { readOnly: request.readOnly })
      return undefined
    case 'ping':
      database().prepare('SELECT 1').get()
      return undefined
    case 'getSchema':
      return getSchema(request.options)
    case 'runQuery':
      return runQuery(request.sql, request.params, request.maxRows)
  }
}

process.on('message', ({ id, request }: SqliteEnvelope) => {
  let response: SqliteResponse
  try {
    response = { id, ok: true, value: handle(request) }
  } catch (error) {
    const code = error instanceof DataAgentError ? { code: error.code } : {}
    response = { id, ok: false, message: (error as Error).message, ...code }
  }
  process.send?.(response)
})

// The parent closing the IPC channel is the normal shutdown signal.
process.on('disconnect', () => {
  db?.close()
  process.exit(0)
})
