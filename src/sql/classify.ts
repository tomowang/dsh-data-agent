// node-sql-parser ships CJS only, with no named ESM exports — default-import
// the module object and destructure, rather than a named import that fails
// to resolve under strict ESM (as opposed to Node's CJS require() interop).
import nodeSqlParser from 'node-sql-parser'

const { Parser } = nodeSqlParser
import type { Engine } from '../data-source/types.ts'

/** Statement AST types treated as read-only across every supported dialect. */
const READ_ONLY_TYPES = new Set(['select', 'show', 'explain', 'desc', 'describe'])

const DIALECT: Record<Engine, string> = {
  mysql: 'mysql',
  postgres: 'postgresql',
  sqlite: 'sqlite',
  // node-sql-parser has no dedicated ClickHouse dialect; 'postgresql' parses
  // plain SELECT/INSERT/DDL closely enough to classify statement type, at the
  // cost of rejecting ClickHouse-specific syntax it can't recognize (FORMAT
  // clauses, some table functions) — same known limitation as SQLite PRAGMA
  // below, not a silent misclassification.
  clickhouse: 'postgresql',
}

export class SqlRejectedError extends Error {}

interface AstLike {
  type: string
}

/**
 * Reject a payload the parser cannot classify (unsupported syntax, or a
 * genuine syntax error) rather than guessing — this is a known limitation:
 * some legitimate read-only statements (SQLite `PRAGMA`, some PostgreSQL
 * `EXPLAIN` forms) fail to parse in the underlying grammar and are rejected
 * along with everything else this can't verify. `da_get_schema` covers the
 * common introspection need instead of requiring raw PRAGMA/EXPLAIN here.
 */
function parseStatements(sql: string, engine: Engine): AstLike[] {
  const parser = new Parser()
  let ast: unknown
  try {
    ast = parser.astify(sql, { database: DIALECT[engine] })
  } catch (error) {
    throw new SqlRejectedError(
      `Could not parse this SQL to verify it is safe to run (${(error as Error).message.split('\n')[0]}). `
      + 'Only syntax the parser recognizes can be verified as read-only.',
    )
  }
  return Array.isArray(ast) ? (ast as AstLike[]) : [ast as AstLike]
}

/**
 * Enforce the safety rules for `da_run_sql`, in order: (1) exactly one
 * top-level statement — blocks statement-stacking regardless of read-only
 * mode; (2) on SQLite, no `ATTACH`/`VACUUM INTO`, also regardless of
 * read-only mode (see `assertNoSqliteFileAccess`); (3) when `readOnly` is set, every statement's type must be in the
 * read-only allowlist, with no read-only-looking escape hatches (see
 * `assertNoReadOnlyEscapes`). Throws `SqlRejectedError` (a plain
 * input-validation error, not a `DataAgentError`) on any violation.
 *
 * This is a fast, friendly first gate, not the enforcement boundary: a
 * SELECT can still call side-effecting functions (`setval`, an extension's
 * UDF, ...) that no list here can anticipate. Each adapter additionally runs
 * read-only sources under the database's own read-only mode (see
 * `adapters/`), and the README tells users to connect with a
 * least-privilege database user for what neither layer covers.
 */
export function assertSqlAllowed(sql: string, engine: Engine, readOnly: boolean): void {
  const statements = parseStatements(sql, engine)

  if (statements.length !== 1) {
    throw new SqlRejectedError(
      `Expected exactly one SQL statement, found ${statements.length}. `
      + 'Statement-stacking is never allowed, regardless of read-only mode.',
    )
  }

  const [statement] = statements
  if (engine === 'sqlite') assertNoSqliteFileAccess(sql, statement)

  if (!readOnly) return

  if (statement === undefined || !READ_ONLY_TYPES.has(statement.type)) {
    throw new SqlRejectedError(
      `This data source is read-only: "${statement?.type ?? 'unknown'}" statements are not allowed. `
      + 'Only the user can make this source read-write, in Settings → Data Sources.',
    )
  }

  // MySQL/MariaDB execute the body of `/*! ... */` (and `/*M! ... */`)
  // comments, but the parser skips them as plain comments — so whatever is
  // inside was never classified. A crude text check: it also rejects the
  // (rare) literal `/*!` inside a string.
  if (engine === 'mysql' && /\/\*M?!/.test(sql)) {
    throw new SqlRejectedError(
      'This data source is read-only: MySQL executable comments (/*! ... */) are not allowed, since their '
      + 'contents cannot be verified as read-only.',
    )
  }

  assertNoReadOnlyEscapes(statement, engine)
}

/** `sql` past any leading whitespace and `--` / `/* *\/` comments, the way SQLite's tokenizer skips them. */
function stripLeadingComments(sql: string): string {
  let rest = sql
  for (;;) {
    rest = rest.trimStart()
    if (rest.startsWith('--')) {
      const end = rest.indexOf('\n')
      rest = end === -1 ? '' : rest.slice(end + 1)
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2)
      rest = end === -1 ? '' : rest.slice(end + 2)
    } else {
      return rest
    }
  }
}

/**
 * `ATTACH` and `VACUUM INTO` open or create a database file at whatever path
 * the SQL names, with the host user's permissions — sidestepping the
 * `sqliteChatDirs` check a source's own path gets. Rejected on every SQLite
 * source, read-write included: a read-write source is the user's to write
 * to, not a licence to create files anywhere.
 *
 * Checked twice: the AST type, and the statement's leading keyword, which
 * doesn't depend on what this parser version can parse. `node:sqlite` only
 * ever runs the first statement of a prepared string, so the leading keyword
 * is the only place either can appear.
 */
function assertNoSqliteFileAccess(sql: string, statement: AstLike | undefined): void {
  const leading = stripLeadingComments(sql)
  if (statement?.type === 'attach' || /^attach\b/i.test(leading) || /^vacuum\b[\s\S]*\binto\b/i.test(leading)) {
    throw new SqlRejectedError(
      'SQLite ATTACH and VACUUM INTO are not allowed: they open or create a database file at any path. '
      + 'Ask the user to add that file as its own data source in Settings → Data Sources instead.',
    )
  }
}

/**
 * ClickHouse table functions that only generate data locally. Every other
 * table function (`url`, `file`, `s3`, `remote`, `mysql`, `postgresql`, ...)
 * reaches outside the database — files on the server, or arbitrary network
 * endpoints — so a read-only source rejects them.
 */
const CLICKHOUSE_SAFE_TABLE_FUNCTIONS = new Set([
  'numbers', 'numbers_mt', 'zeros', 'zeros_mt', 'generate_series', 'generateseries', 'values', 'null',
])

/**
 * Functions a read-only source rejects anywhere in a statement, because the
 * database's own read-only mode doesn't contain them: they read files on the
 * database server, act through a second connection outside this query's
 * read-only transaction (`dblink_exec`), or take session-level locks that
 * outlive its ROLLBACK on the pooled connection. A known-bad list, not a
 * boundary — anything missing from it (an extension or UDF installed on the
 * server) still runs, which is why the README tells users to connect with a
 * least-privilege database user.
 */
const READ_ONLY_DENIED_FUNCTIONS: Record<Engine, RegExp> = {
  postgres: new RegExp('^(?:' + [
    'dblink\\w*',
    'pg_read_file', 'pg_read_binary_file', 'pg_ls_\\w+', 'pg_stat_file', 'lo_import', 'lo_export', 'pg_file_\\w+',
    'pg_(?:try_)?advisory_lock(?:_shared)?',
    'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf',
  ].join('|') + ')$'),
  mysql: /^(?:load_file|get_lock|sys_exec|sys_eval|sys_bineval)$/,
  // ClickHouse's scalar `file()` reads from the server's user_files; its
  // external *table* functions are handled separately below.
  clickhouse: /^file$/,
  sqlite: /^load_extension$/,
}

function functionName(expr: unknown): string | undefined {
  const name = (expr as { name?: { name?: { value?: unknown }[] } } | undefined)?.name?.name
  const last = name?.[name.length - 1]?.value
  return typeof last === 'string' ? last.toLowerCase() : undefined
}

/**
 * Walk the whole AST (subqueries, CTEs, UNION arms) for read-only-looking
 * SELECTs that still write or reach outside the database: `SELECT ... INTO`
 * (a new table on PostgreSQL, a server-side file on MySQL), calls to
 * `READ_ONLY_DENIED_FUNCTIONS`, and, on ClickHouse, external-access table
 * functions in any FROM/JOIN.
 */
function assertNoReadOnlyEscapes(node: unknown, engine: Engine): void {
  if (Array.isArray(node)) {
    for (const child of node) assertNoReadOnlyEscapes(child, engine)
    return
  }
  if (typeof node !== 'object' || node === null) return
  const record = node as Record<string, unknown>

  if ((record.into as { type?: unknown } | null | undefined)?.type === 'into') {
    throw new SqlRejectedError(
      'This data source is read-only: SELECT ... INTO writes a table or file and is not allowed.',
    )
  }

  if (record.type === 'function') {
    const name = functionName(record)
    if (name !== undefined && READ_ONLY_DENIED_FUNCTIONS[engine].test(name)) {
      throw new SqlRejectedError(
        `This data source is read-only: the function "${name}" can read server files, act outside this query's `
        + 'read-only transaction, or hold locks past it, and is not allowed.',
      )
    }
  }

  if (engine === 'clickhouse' && Array.isArray(record.from)) {
    for (const item of record.from as { type?: unknown, expr?: { type?: unknown } }[]) {
      if (item?.type !== 'expr' || item.expr?.type !== 'function') continue
      const name = functionName(item.expr)
      if (name === undefined || !CLICKHOUSE_SAFE_TABLE_FUNCTIONS.has(name)) {
        throw new SqlRejectedError(
          `This data source is read-only: the ClickHouse table function "${name ?? 'unknown'}" can read files or `
          + 'network endpoints outside the database and is not allowed.',
        )
      }
    }
  }

  for (const value of Object.values(record)) assertNoReadOnlyEscapes(value, engine)
}
