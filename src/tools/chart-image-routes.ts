import type { Context } from '@deepseek-ai/cordis'
import { isTrustedRequest } from '../settings-api/trust.ts'
import { registerWebRoute } from '../settings-api/web-route.ts'

/**
 * No trailing slash: `ctx.webServer`'s own `kind: 'prefix'` matching is
 * `pathname === path || pathname.startsWith(`${path}/`)` — it appends the
 * separator itself, so a `path` that already ends in `/` only ever matches
 * `.../chart-image//...` and silently never matches a real request.
 */
const ROUTE_PATH = '/dsh-data-agent/api/chart-image'
export const CHART_IMAGE_ROUTE_PREFIX = `${ROUTE_PATH}/`

/**
 * The harness's chat Markdown only reads a bare `/...` path as a local
 * filesystem path (off the Host's own disk, with its own separate
 * size/timing/permission rules) — never as a URL resolved against the page's
 * origin. A plain `http(s)://` URL is the one image form it always renders,
 * including mid-stream, so that's what `da_render_chart` must embed instead
 * of the bare route path. `0.0.0.0` isn't itself a browsable host, so it's
 * swapped for `'localhost'`, which is always reachable and always among the
 * hosts `trust.ts`'s `isTrustedRequest` accepts.
 *
 * Reads `webServer` via `ctx.get`, not direct `ctx.webServer` access: this is
 * called from `chart-image.ts`, itself called from `render-chart.ts`'s own
 * composition unit (`inject: ['tools', 'dataAgent', 'queryResultCache']`,
 * deliberately not `'webServer'`, so the tool works on a headless/ACP
 * profile too). Cordis throws "cannot get property ... without inject" on a
 * direct property read from a fiber that hasn't declared it; `ctx.get` is
 * the sanctioned unchecked read, same pattern as `credential.ts`'s
 * `ctx.get('credentials')`.
 */
export function chartImageUrl(ctx: Context, id: string): string {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) throw new Error('chartImageUrl: no webServer mounted')
  const host = webServer.host === '0.0.0.0' ? 'localhost' : webServer.host
  return `http://${host}:${webServer.port}${CHART_IMAGE_ROUTE_PREFIX}${id}.png`
}

/**
 * Serves PNGs `da_render_chart` rendered into `ctx.chartImageStore`, at the
 * URL `chartImageUrl` builds for it. Reads the store via `ctx.get`, not
 * direct `ctx.chartImageStore` access — `index.ts` instantiates `ChartImageStore`
 * as a sibling call inside this same `apply()`'s composing plugin, which
 * only declares `inject: ['webServer']`; the route handler's closure over
 * that same `ctx` has no `chartImageStore` in its own inject list either.
 */
export function applyChartImageRoutes(ctx: Context): void {
  registerWebRoute(ctx, {
    kind: 'prefix',
    path: ROUTE_PATH,
    handler(req, res) {
      if (!isTrustedRequest(ctx, req)) {
        res.writeHead(403)
        res.end()
        return
      }
      const url = req.url ?? ''
      const id = url.slice(url.indexOf(CHART_IMAGE_ROUTE_PREFIX) + CHART_IMAGE_ROUTE_PREFIX.length).replace(/\.png$/, '')
      const buffer = ctx.get('chartImageStore')?.get(id)
      if (buffer === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=1800, immutable' })
      res.end(buffer)
    },
  })
}
