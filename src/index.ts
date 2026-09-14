import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { DataSourceRegistry } from './data-source/registry.ts'
import { applyAddDataSourceTool } from './tools/add-data-source.ts'
import { applyGetSchemaTool } from './tools/get-schema.ts'
import { applyListDataSourcesTool } from './tools/list-data-sources.ts'
import { applyRemoveDataSourceTool } from './tools/remove-data-source.ts'
import { applyRunSqlTool } from './tools/run-sql.ts'
import { applySetCommentTool } from './tools/set-comment.ts'
import { applySetReadOnlyTool } from './tools/set-read-only.ts'
import { applyTestConnectionTool } from './tools/test-connection.ts'

export const name = 'data-agent'

export interface Config {
  /** Default row cap for run_sql when the caller doesn't pass maxRows. */
  defaultMaxRows: number
}

export const Config: Schema<Config> = Schema.object({
  defaultMaxRows: Schema.number().default(500),
})

export function apply(ctx: Context, config: Config): void {
  ctx.plugin(DataSourceRegistry)

  ctx.plugin({
    name: 'dsh-data-agent-tools',
    inject: ['tools', 'dataAgent'],
    apply(toolsCtx: Context) {
      applyAddDataSourceTool(toolsCtx)
      applyRemoveDataSourceTool(toolsCtx)
      applyListDataSourcesTool(toolsCtx)
      applyTestConnectionTool(toolsCtx)
      applySetReadOnlyTool(toolsCtx)
      applyGetSchemaTool(toolsCtx)
      applySetCommentTool(toolsCtx)
      applyRunSqlTool(toolsCtx, config.defaultMaxRows)
    },
  })
}
