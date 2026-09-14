import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/**
 * A minimal same-origin guard for our raw `ctx.webServer` routes. Unlike
 * `ctx.remote` calls (routed through Connection's own `/api` prefix, which
 * carries its own Origin/DNS-rebinding trust fence), a plain
 * `ctx.webServer.register()` route gets no such fence for free — this
 * reproduces the essential check (reject any request whose `Origin`, when
 * present, doesn't match this server's own scheme+host+port) ourselves.
 * Consistent with, not a new gap in, the existing threat model: a
 * `host: '0.0.0.0'` deployment is already documented as deliberate exposure
 * with no TLS/auth/origin policy of its own; this guard only ever narrows
 * what such a deployment already accepts.
 */
export function isTrustedOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  // No Origin header at all (e.g. a same-process curl/test call) is trusted —
  // browsers always send Origin for cross-origin fetches and same-origin
  // navigations that matter here; its absence is not itself the attack this
  // guards against.
  if (origin === undefined) return true

  const expectedHosts = new Set([ctx.webServer.host, 'localhost'])
  try {
    const url = new URL(origin)
    return url.port === String(ctx.webServer.port) && expectedHosts.has(url.hostname)
  } catch {
    return false
  }
}
