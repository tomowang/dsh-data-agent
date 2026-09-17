import type { Context } from '@deepseek-ai/cordis'
import type { QueryRow } from '../data-source/types.ts'
import { buildChartConfig } from './chart-config.ts'
import { renderChartImage } from './chart-image-renderer.ts'
import { chartImageUrl } from './chart-image-routes.ts'
import type { ChartType } from './chart-spec.ts'

/**
 * Renders `da_render_chart`'s static PNG and returns the absolute URL to
 * embed it from, or `undefined` when there's nothing to embed it in (no
 * `webServer` — soft-checked via `ctx.get`, never `inject`, so a headless/ACP
 * profile just gets the tabular result with no image) or when rendering
 * itself failed. Never throws: the chart's tabular data is the tool's core
 * result, and a broken image render shouldn't take that down with it — the
 * failure is only logged (`ctx.logger`), not swallowed silently, so a broken
 * render is still diagnosable.
 */
export async function renderChartImageUrl(
  ctx: Context,
  type: ChartType,
  x: string,
  y: string | readonly string[],
  rows: readonly QueryRow[],
): Promise<string | undefined> {
  const store = ctx.get('chartImageStore')
  if (store === undefined) return undefined
  try {
    const config = buildChartConfig(type, x, y, rows)
    const buffer = await renderChartImage(config)
    const id = store.put(buffer)
    return chartImageUrl(ctx, id)
  } catch (error) {
    ctx.logger('dsh-data-agent').warn('da_render_chart: static PNG render failed, falling back to tabular-only output', error)
    return undefined
  }
}
