import type { Context } from '@deepseek-ai/cordis'
import { GetSchemaRow } from '../components/GetSchemaRow.tsx'

export const getSchemaToolview = {
  name: 'get-schema-toolview',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'da_get_schema' }, GetSchemaRow))
  },
}
