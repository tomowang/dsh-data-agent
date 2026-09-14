import type { Context } from '@deepseek-ai/cordis'
import { RunSqlRow } from '../components/RunSqlRow.tsx'

export const runSqlToolview = {
  name: 'run-sql-toolview',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'run_sql' }, RunSqlRow))
  },
}
