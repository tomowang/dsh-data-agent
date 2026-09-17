import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { CHART_IMAGE_ROUTE_PREFIX } from '../src/tools/chart-image-routes.ts'
import { ChartImageStore } from '../src/tools/chart-image-store.ts'
import { applyRenderChartTool } from '../src/tools/render-chart.ts'
import type { ToolDefinition } from '../src/tools/tool-types.ts'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

interface FakeWebServer {
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  register: () => () => void
}

/**
 * Mirrors `index.ts`'s actual composition — `ChartImageStore` mounted inside
 * its own `inject: ['webServer']` unit, `da_render_chart` mounted inside its
 * own `inject: ['tools', 'dataAgent', 'queryResultCache']` unit (deliberately
 * NOT `webServer`) — rather than calling `applyRenderChartTool` on a bare,
 * inject-unrestricted root `Context`. Cordis only enforces "cannot get
 * property ... without inject" for a fiber that actually declared an inject
 * list, so a flatter harness would never have caught the bug where
 * `chart-image-routes.ts` read `ctx.webServer`/`ctx.chartImageStore` by
 * direct property access from a fiber that hadn't injected them.
 */
async function createTestContext(webServer?: FakeWebServer): Promise<{ ctx: Context, tool: ToolDefinition, dispose: () => Promise<void> }> {
  const ctx = new Context()
  let tool: ToolDefinition | undefined
  ctx.provide('tools', { register: (definition: ToolDefinition) => { tool = definition; return () => {} } })
  ctx.provide('dataAgent', {})
  ctx.provide('queryResultCache', {})
  if (webServer !== undefined) ctx.provide('webServer', webServer)

  const chartImageFiber = await ctx.plugin({
    name: 'test-chart-image',
    inject: ['webServer'],
    apply(imageCtx: Context) { imageCtx.plugin(ChartImageStore) },
  })
  const toolsFiber = await ctx.plugin({
    name: 'test-tools',
    inject: ['tools', 'dataAgent', 'queryResultCache'],
    apply: applyRenderChartTool,
  })

  return {
    ctx,
    tool: tool!,
    dispose: async () => { await chartImageFiber.dispose(); await toolsFiber.dispose() },
  }
}

describe('da_render_chart image output', () => {
  it('renders a real PNG and includes an absolute http(s) URL to it in the tool text output', async () => {
    const { ctx, tool, dispose } = await createTestContext({ host: '127.0.0.1', port: 3080, register: () => () => {} })

    const value = await tool.execute(
      { type: 'bar', x: 'month', y: 'revenue', data: [{ month: 'Jan', revenue: 10 }, { month: 'Feb', revenue: 20 }] },
      {},
    ) as { imageUrl?: string }

    // Must be an absolute http(s) URL, not a bare path — the harness's chat
    // Markdown only reads a bare `/...` path as a local filesystem path.
    const parsed = new URL(value.imageUrl!)
    expect(`${parsed.protocol}//${parsed.host}`).toBe('http://127.0.0.1:3080')
    expect(parsed.pathname).toMatch(new RegExp(`^${CHART_IMAGE_ROUTE_PREFIX}.+\\.png$`))
    const id = parsed.pathname.slice(CHART_IMAGE_ROUTE_PREFIX.length, -'.png'.length)
    const buffer = ctx.get('chartImageStore')?.get(id)
    expect(buffer?.subarray(0, 4)).toEqual(PNG_MAGIC)

    const text = tool.output.render({}, value)[0]!.text
    expect(text).toContain(`![bar chart of revenue by month](${value.imageUrl})`)

    await dispose()
  })

  it('substitutes localhost for a 0.0.0.0 webServer host, since trust.ts recognizes that but not 0.0.0.0 as an Origin', async () => {
    const { tool, dispose } = await createTestContext({ host: '0.0.0.0', port: 3080, register: () => () => {} })

    const value = await tool.execute(
      { type: 'bar', x: 'month', y: 'revenue', data: [{ month: 'Jan', revenue: 10 }] },
      {},
    ) as { imageUrl?: string }

    expect(value.imageUrl).toMatch(/^http:\/\/localhost:3080/)
    await dispose()
  })

  it('omits the imageUrl key entirely (and falls back to the plain Web-UI note) with no webServer mounted', async () => {
    const { tool, dispose } = await createTestContext()

    const value = await tool.execute(
      { type: 'bar', x: 'month', y: 'revenue', data: [{ month: 'Jan', revenue: 10 }] },
      {},
    ) as { imageUrl?: string }

    // Not just `=== undefined` (a value the tool output must be JSON — an
    // `imageUrl: undefined` key left in place, rather than omitted, is what
    // tripped the harness's "value is not lossless JSON" rejection).
    expect('imageUrl' in value).toBe(false)
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)

    const text = tool.output.render({}, value)[0]!.text
    expect(text).toContain('_(a chart of this data renders in the Web UI)_')
    expect(text).not.toContain('![')

    await dispose()
  })
})
