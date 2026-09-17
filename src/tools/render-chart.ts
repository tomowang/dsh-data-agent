import type { Context } from '@deepseek-ai/cordis'
import type { QueryColumn, QueryRow } from '../data-source/types.ts'
import { renderChartImageUrl } from './chart-image.ts'
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
  imageUrl?: string
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
      'Render a bar/stacked-bar/line/pie chart in the Web UI from data you already have. Pass either `resultId` (the id a '
      + 'prior da_run_sql call returned, to chart that result\'s rows without resending them) or `data` (an '
      + 'inline array of row objects), but not both. `x`/`y` must name columns present in that data. For '
      + '`stacked-bar`, pass multiple `y` columns to stack as segments of each bar. The result also includes '
      + '`imageUrl`, a static PNG of the same chart — embed it in your reply as Markdown (`![](imageUrl)`) '
      + 'wherever a picture of the chart should appear in your own text, alongside the interactive chart the Web UI '
      + 'already renders from this call.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'x', 'y'],
      properties: {
        type: { type: 'string', enum: [...CHART_TYPES] },
        x: { type: 'string' },
        y: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'A column name, or an array of column names to plot as multiple series (multiple stacked segments for `stacked-bar`).',
        },
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
          imageUrl: { type: 'string' },
        },
      },
      render(_args, value) {
        const result = value as RenderChartValue
        const columns = result.columns.map(c => c.name)
        const table = renderMarkdownTable(columns, result.rows, {
          limit: RENDER_PREVIEW_ROWS,
          totalRowCount: result.rowCount,
        })
        const yLabel = Array.isArray(result.y) ? result.y.join(', ') : result.y
        const note = result.imageUrl === undefined
          ? '_(a chart of this data renders in the Web UI)_'
          : `_(a chart of this data renders in the Web UI)_ — to show it in your reply: `
            + `![${result.type} chart of ${yLabel} by ${result.x}](${result.imageUrl})`
        return [{ type: 'text', text: `${table}\n\n${note}` }]
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
        const imageUrl = await renderChartImageUrl(ctx, type, x, y, rows)
        return { type, x, y, columns, rows, rowCount: rows.length, truncated: false, ...(imageUrl !== undefined && { imageUrl }) }
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
      const imageUrl = await renderChartImageUrl(ctx, type, x, y, cached.rows)
      return {
        type, x, y,
        columns: [...cached.columns],
        rows: [...cached.rows],
        rowCount: cached.rowCount,
        truncated: cached.truncated,
        sourceName: cached.sourceName,
        sql: cached.sql,
        ...(imageUrl !== undefined && { imageUrl }),
      }
    },
  })
}
