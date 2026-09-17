import type { Context } from '@deepseek-ai/cordis'
import { RenderChartRow } from '../components/RenderChartRow.tsx'

export const renderChartToolview = {
  name: 'render-chart-toolview',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'da_render_chart' }, RenderChartRow))
  },
}
