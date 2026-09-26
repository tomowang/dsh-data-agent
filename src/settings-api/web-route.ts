import type { Context, WebRoute } from '@deepseek-ai/cordis'

/**
 * Register a raw `ctx.webServer` route for the lifetime of `ctx`'s plugin.
 * Unlike `ctx.tools.register`, `webServer.register` isn't tied to the
 * caller's fiber: it returns a plain disposer and keeps the route until that
 * disposer runs. Without this wrapper, a plugin reload (a config change or
 * disable/enable on the harness's Plugins page) would re-register the same
 * path and fail with "duplicate exact route", and a disabled plugin would
 * keep serving its routes.
 */
export function registerWebRoute(ctx: Context, route: WebRoute): void {
  ctx.effect(() => ctx.webServer.register(route), `dsh-data-agent: ${route.path} route`)
}
