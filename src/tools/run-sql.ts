import type { Context } from '@deepseek-ai/cordis'
import { assertSqlAllowed } from '../sql/classify.ts'
import type { JsonScalar, QueryResult } from '../data-source/types.ts'
import { renderMarkdownTable } from './shared.ts'
import { asRecord, optionalNumber, requireEnum, requireString } from './tool-types.ts'

const NAME = 'da_run_sql'
/** Safety ceiling, not deployment-configurable: unbounded row limits are a stability/security invariant. */
const HARD_MAX_ROWS = 5000
const RENDER_PREVIEW_ROWS = 50
const PRESENTATION_ROW_CAP = 200
const CHART_TYPES = ['bar', 'line', 'pie'] as const

interface ChartSpec {
  type: (typeof CHART_TYPES)[number]
  x: string
  y: string | string[]
}

interface RunSqlValue extends QueryResult {
  sourceName: string
  sql: string
  chart?: ChartSpec
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

function parseChart(args: Record<string, unknown>, columns: readonly { name: string }[]): ChartSpec | undefined {
  const raw = args.chart
  if (raw === undefined) return undefined
  if (typeof raw !== 'object' || raw === null) throw new Error(`${NAME}: "chart" must be an object`)
  const chart = raw as Record<string, unknown>
  const type = requireEnum(chart, 'type', CHART_TYPES, NAME)
  const x = requireString(chart, 'x', NAME)
  const yRaw = chart.y
  const y = typeof yRaw === 'string' ? yRaw : Array.isArray(yRaw) ? yRaw : undefined
  if (y === undefined || (Array.isArray(y) && y.some(entry => typeof entry !== 'string'))) {
    throw new Error(`${NAME}: "chart.y" is required and must be a string or an array of strings`)
  }

  const names = new Set(columns.map(column => column.name))
  const yColumns = Array.isArray(y) ? y : [y]
  for (const column of [x, ...yColumns]) {
    if (!names.has(column)) {
      throw new Error(`${NAME}: chart column "${column}" is not among the query's result columns`)
    }
  }

  return { type, x, y }
}

export function applyRunSqlTool(ctx: Context, defaultMaxRows: number): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Run one SQL statement against a registered data source. Statement-stacking (multiple ;-separated '
      + 'statements) is always rejected. On a read-only source, only SELECT/SHOW/EXPLAIN-class statements are '
      + 'allowed — toggle with da_set_read_only to run writes. Bind parameters with the target engine\'s native '
      + 'placeholder syntax: `?` for MySQL/SQLite, `$1, $2, ...` for PostgreSQL. Pass `chart` to additionally '
      + 'render a bar/line/pie chart of the result in the Web UI (x/y must name columns in the result).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceName', 'sql'],
      properties: {
        sourceName: { type: 'string' },
        sql: { type: 'string' },
        params: { type: 'array', items: {}, description: 'Bind parameters, in order.' },
        maxRows: { type: 'number', description: `Defaults to ${defaultMaxRows}, capped at ${HARD_MAX_ROWS}.` },
        chart: {
          type: 'object',
          required: ['type', 'x', 'y'],
          properties: {
            type: { type: 'string', enum: [...CHART_TYPES] },
            x: { type: 'string' },
            y: { type: 'string' },
          },
        },
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
          chart: {
            type: 'object',
            properties: { type: { type: 'string' }, x: { type: 'string' }, y: {} },
          },
        },
      },
      render(_args, value) {
        const result = value as RunSqlValue
        const columns = result.columns.map(c => c.name)
        const table = renderMarkdownTable(columns, result.rows, {
          limit: RENDER_PREVIEW_ROWS,
          totalRowCount: result.rowCount,
        })
        const lines = [table]
        if (result.chart !== undefined) lines.push('\n_(a chart of this result renders in the Web UI)_')
        return [{ type: 'text', text: lines.join('\n') }]
      },
      presentationMeta(_args, value) {
        const result = value as RunSqlValue
        return { ...result, rows: result.rows.slice(0, PRESENTATION_ROW_CAP) }
      },
    },
    async execute(rawArgs): Promise<RunSqlValue> {
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
      const chart = parseChart(args, result.columns)

      return { sourceName, sql, ...result, ...(chart !== undefined ? { chart } : {}) }
    },
  })
}
