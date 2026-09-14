import type { Context } from '@deepseek-ai/cordis'
import { getSchemaToolview } from './tool/toolviews/get-schema-toolview.ts'
import { runSqlToolview } from './tool/toolviews/run-sql-toolview.ts'

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.plugin(runSqlToolview)
  ctx.plugin(getSchemaToolview)
}
