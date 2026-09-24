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
 * Enforce the two safety rules for `da_run_sql`, in order: (1) exactly one
 * top-level statement — blocks statement-stacking regardless of read-only
 * mode; (2) when `readOnly` is set, every statement's type must be in the
 * read-only allowlist, with no read-only-looking escape hatches (see
 * `assertNoReadOnlyEscapes`). Throws `SqlRejectedError` (a plain
 * input-validation error, not a `DataAgentError`) on any violation.
 *
 * This is a fast, friendly first gate, not the enforcement boundary: a
 * SELECT can still call side-effecting functions (`setval`, `GET_LOCK`, ...)
 * the parser can't see. Each adapter additionally runs read-only sources
 * under the database's own read-only mode (see `adapters/`).
 */
export function assertSqlAllowed(sql: string, engine: Engine, readOnly: boolean): void {
  const statements = parseStatements(sql, engine)

  if (statements.length !== 1) {
    throw new SqlRejectedError(
      `Expected exactly one SQL statement, found ${statements.length}. `
      + 'Statement-stacking is never allowed, regardless of read-only mode.',
    )
  }

  if (!readOnly) return

  const [statement] = statements
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

/**
 * ClickHouse table functions that only generate data locally. Every other
 * table function (`url`, `file`, `s3`, `remote`, `mysql`, `postgresql`, ...)
 * reaches outside the database — files on the server, or arbitrary network
 * endpoints — so a read-only source rejects them.
 */
const CLICKHOUSE_SAFE_TABLE_FUNCTIONS = new Set([
  'numbers', 'numbers_mt', 'zeros', 'zeros_mt', 'generate_series', 'generateseries', 'values', 'null',
])

function functionName(expr: unknown): string | undefined {
  const name = (expr as { name?: { name?: { value?: unknown }[] } } | undefined)?.name?.name
  const last = name?.[name.length - 1]?.value
  return typeof last === 'string' ? last.toLowerCase() : undefined
}

/**
 * Walk the whole AST (subqueries, CTEs, UNION arms) for read-only-looking
 * SELECTs that still write or reach outside the database: `SELECT ... INTO`
 * (a new table on PostgreSQL, a server-side file on MySQL) and, on
 * ClickHouse, external-access table functions in any FROM/JOIN.
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
