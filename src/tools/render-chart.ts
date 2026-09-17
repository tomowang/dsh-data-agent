import type { Context } from '@deepseek-ai/cordis'
import type { QueryColumn, QueryRow } from '../data-source/types.ts'
import { CHART_TYPES, assertAxesInColumns, parseInlineData, type ChartType } from './chart-spec.ts'
import { renderMarkdownTable } from './shared.ts'
import { asRecord, requireEnum, requireString, ToolInputError, type ToolRunContext } from './tool-types.ts'

const NAME = 'da_render_chart'
const RENDER_PREVIEW_ROWS = 50
const PRESENTATION_ROW_CAP = 200

interface RenderChartValue {
  type: ChartType
  x: string
  y: string | string[]
  columns: QueryColumn[]
  rows: QueryRow[]
  rowCount: number
  truncated: boolean
  sourceName?: string
  sql?: string
}

function parseY(args: Record<string, unknown>): string | string[] {
  const y = args.y
  if (typeof y === 'string') return y
  if (Array.isArray(y) && y.every(entry => typeof entry === 'string') && y.length > 0) return y as string[]
  throw new ToolInputError(`${NAME}: "y" is required and must be a string or a non-empty array of strings`)
}

export function applyRenderChartTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Render a bar/line/pie chart in the Web UI from data you already have. Pass either `resultId` (the id a '
      + 'prior da_run_sql call returned, to chart that result\'s rows without resending them) or `data` (an '
      + 'inline array of row objects), but not both. `x`/`y` must name columns present in that data.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'x', 'y'],
      properties: {
        type: { type: 'string', enum: [...CHART_TYPES] },
        x: { type: 'string' },
        y: { type: 'string' },
        resultId: { type: 'string', description: 'A `resultId` from a prior da_run_sql call, scoped to this conversation.' },
        data: { type: 'array', items: { type: 'object', properties: {} }, description: 'Inline row objects, used instead of resultId.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        required: ['type', 'x', 'y', 'columns', 'rows', 'rowCount', 'truncated'],
        properties: {
          type: { type: 'string' },
          x: { type: 'string' },
          y: {},
          columns: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, dataType: { type: 'string' } } } },
          rows: { type: 'array', items: { type: 'object', properties: {} } },
          rowCount: { type: 'number' },
          truncated: { type: 'boolean' },
          sourceName: { type: 'string' },
          sql: { type: 'string' },
        },
      },
      render(_args, value) {
        const result = value as RenderChartValue
        const columns = result.columns.map(c => c.name)
        const table = renderMarkdownTable(columns, result.rows, {
          limit: RENDER_PREVIEW_ROWS,
          totalRowCount: result.rowCount,
        })
        return [{ type: 'text', text: `${table}\n\n_(a chart of this data renders in the Web UI)_` }]
      },
      presentationMeta(_args, value) {
        const result = value as RenderChartValue
        return { ...result, rows: result.rows.slice(0, PRESENTATION_ROW_CAP) }
      },
    },
    async execute(rawArgs, exec: ToolRunContext): Promise<RenderChartValue> {
      const args = asRecord(rawArgs, NAME)
      const type = requireEnum(args, 'type', CHART_TYPES, NAME)
      const x = requireString(args, 'x', NAME)
      const y = parseY(args)

      const hasResultId = args.resultId !== undefined
      const hasData = args.data !== undefined
      if (hasResultId === hasData) {
        throw new ToolInputError(`${NAME}: pass exactly one of "resultId" or "data"`)
      }

      if (hasData) {
        const { columns, rows } = parseInlineData(NAME, args.data)
        assertAxesInColumns(NAME, columns, x, y)
        return { type, x, y, columns, rows, rowCount: rows.length, truncated: false }
      }

      const resultId = requireString(args, 'resultId', NAME)
      const cached = ctx.queryResultCache.get(exec.agent?.id, resultId)
      if (cached === undefined) {
        throw new ToolInputError(
          `${NAME}: no cached result for resultId "${resultId}" — it may have expired or belong to another `
          + 'conversation; re-run da_run_sql, or pass the rows directly via "data"',
        )
      }
      assertAxesInColumns(NAME, cached.columns, x, y)
      return {
        type, x, y,
        columns: [...cached.columns],
        rows: [...cached.rows],
        rowCount: cached.rowCount,
        truncated: cached.truncated,
        sourceName: cached.sourceName,
        sql: cached.sql,
      }
    },
  })
}
