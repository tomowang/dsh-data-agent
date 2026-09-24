import type { Context } from '@deepseek-ai/cordis'
import { assertSqlAllowed } from '../sql/classify.ts'
import type { JsonScalar, QueryResult } from '../data-source/types.ts'
import { renderMarkdownTable } from './shared.ts'
import { asRecord, optionalNumber, requireString, type ToolRunContext } from './tool-types.ts'

const NAME = 'da_run_sql'
/** Safety ceiling, not deployment-configurable: unbounded row limits are a stability/security invariant. */
const HARD_MAX_ROWS = 5000
const RENDER_PREVIEW_ROWS = 50
const PRESENTATION_ROW_CAP = 200

interface RunSqlValue extends QueryResult {
  sourceName: string
  sql: string
  resultId?: string
}

function parseParams(args: Record<string, unknown>): JsonScalar[] | undefined {
  const value = args.params
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${NAME}: "params" must be an array`)
  for (const item of value) {
    if (item !== null && typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
      throw new Error(`${NAME}: "params" entries must be string, number, boolean, or null`)
    }
  }
  return value as JsonScalar[]
}

export function applyRunSqlTool(ctx: Context, defaultMaxRows: number): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Run one SQL statement against a registered data source. Statement-stacking (multiple ;-separated '
      + 'statements) is always rejected. On a read-only source, only SELECT/SHOW/EXPLAIN-class statements are '
      + 'allowed — only the user can make a source read-write, in Settings → Data Sources. Bind parameters with the target engine\'s native '
      + 'placeholder syntax: `?` for MySQL/SQLite, `$1, $2, ...` for PostgreSQL, `{p1:Type}, {p2:Type}, ...` for '
      + 'ClickHouse (named parameters, bound positionally to `params` — e.g. `{p1:String}` for the first entry). '
      + 'The result carries a `resultId` you can pass to da_render_chart\'s `resultId` to chart it without '
      + 're-sending the rows.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceName', 'sql'],
      properties: {
        sourceName: { type: 'string' },
        sql: { type: 'string' },
        params: { type: 'array', items: {}, description: 'Bind parameters, in order.' },
        maxRows: { type: 'number', description: `Defaults to ${defaultMaxRows}, capped at ${HARD_MAX_ROWS}.` },
      },
    },
    output: {
      schema: {
        type: 'object',
        required: ['sourceName', 'sql', 'columns', 'rows', 'rowCount', 'truncated'],
        properties: {
          sourceName: { type: 'string' },
          sql: { type: 'string' },
          columns: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, dataType: { type: 'string' } } } },
          rows: { type: 'array', items: { type: 'object', properties: {} } },
          rowCount: { type: 'number' },
          truncated: { type: 'boolean' },
          resultId: { type: 'string' },
        },
      },
      render(_args, value) {
        const result = value as RunSqlValue
        const columns = result.columns.map(c => c.name)
        const table = renderMarkdownTable(columns, result.rows, {
          limit: RENDER_PREVIEW_ROWS,
          totalRowCount: result.rowCount,
          truncated: result.truncated,
        })
        const lines = [table]
        if (result.resultId !== undefined) {
          lines.push(`\n_(resultId: \`${result.resultId}\` — pass to da_render_chart's \`resultId\` to chart this result)_`)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
      presentationMeta(_args, value) {
        const result = value as RunSqlValue
        return { ...result, rows: result.rows.slice(0, PRESENTATION_ROW_CAP) }
      },
    },
    async execute(rawArgs, exec: ToolRunContext): Promise<RunSqlValue> {
      const args = asRecord(rawArgs, NAME)
      const sourceName = requireString(args, 'sourceName', NAME)
      const sql = requireString(args, 'sql', NAME)
      const params = parseParams(args)
      const maxRows = Math.min(optionalNumber(args, 'maxRows', NAME) ?? defaultMaxRows, HARD_MAX_ROWS)

      const record = await ctx.dataAgent.get(sourceName)
      if (record === undefined) throw new Error(`${NAME}: no data source named "${sourceName}"`)
      assertSqlAllowed(sql, record.engine, record.readOnly)

      const adapter = await ctx.dataAgent.getAdapter(sourceName)
      const result = await adapter.runQuery(sql, { params, maxRows })
      const resultId = ctx.queryResultCache.put(exec.agent?.id, { sourceName, sql, ...result })

      return { sourceName, sql, ...result, ...(resultId !== undefined ? { resultId } : {}) }
    },
  })
}
