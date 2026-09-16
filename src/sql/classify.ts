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
 * read-only allowlist. Throws `SqlRejectedError` (a plain input-validation
 * error, not a `DataAgentError`) on any violation.
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
      + 'Toggle read-only off for this source (da_set_read_only) to run write statements.',
    )
  }
}
