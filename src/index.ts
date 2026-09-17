import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { DataSourceRegistry } from './data-source/registry.ts'
import { applySettingsApiRoutes } from './settings-api/routes.ts'
import { applyAddDataSourceTool } from './tools/add-data-source.ts'
import { applyChartImageRoutes } from './tools/chart-image-routes.ts'
import { ChartImageStore } from './tools/chart-image-store.ts'
import { applyEditDataSourceTool } from './tools/edit-data-source.ts'
import { applyGetSchemaTool } from './tools/get-schema.ts'
import { applyListDataSourcesTool } from './tools/list-data-sources.ts'
import { QueryResultCache } from './tools/query-result-cache.ts'
import { applyRemoveDataSourceTool } from './tools/remove-data-source.ts'
import { applyRenderChartTool } from './tools/render-chart.ts'
import { applyRunSqlTool } from './tools/run-sql.ts'
import { applySetCommentTool } from './tools/set-comment.ts'
import { applySetReadOnlyTool } from './tools/set-read-only.ts'
import { applyTestConnectionTool } from './tools/test-connection.ts'

export const name = 'data-agent'

export interface Config {
  /** Default row cap for da_run_sql when the caller doesn't pass maxRows. */
  defaultMaxRows: number
}

export const Config: Schema<Config> = Schema.object({
  defaultMaxRows: Schema.number().default(500),
})

export function apply(ctx: Context, config: Config): void {
  ctx.plugin(DataSourceRegistry)
  ctx.plugin(QueryResultCache)

  ctx.plugin({
    name: 'dsh-data-agent-tools',
    inject: ['tools', 'dataAgent', 'queryResultCache'],
    apply(toolsCtx: Context) {
      applyAddDataSourceTool(toolsCtx)
      applyEditDataSourceTool(toolsCtx)
      applyRemoveDataSourceTool(toolsCtx)
      applyListDataSourcesTool(toolsCtx)
      applyTestConnectionTool(toolsCtx)
      applySetReadOnlyTool(toolsCtx)
      applyGetSchemaTool(toolsCtx)
      applySetCommentTool(toolsCtx)
      applyRunSqlTool(toolsCtx, config.defaultMaxRows)
      applyRenderChartTool(toolsCtx)
    },
  })

  // Settings-page API: a separate composition unit so it simply never
  // activates on a profile with no webServer (headless/ACP), rather than
  // failing the whole plugin.
  ctx.plugin({
    name: 'dsh-data-agent-settings-api',
    inject: ['webServer', 'dataAgent'],
    apply: applySettingsApiRoutes,
  })

  // da_render_chart's static PNG output: same webServer-gated pattern as the
  // Settings API above. render-chart.ts soft-checks `ctx.get('chartImageStore')`
  // rather than injecting it, so it degrades to tabular-only output here.
  ctx.plugin({
    name: 'dsh-data-agent-chart-image',
    inject: ['webServer'],
    apply(imageCtx: Context) {
      imageCtx.plugin(ChartImageStore)
      applyChartImageRoutes(imageCtx)
    },
  })
}
