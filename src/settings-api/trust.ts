import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]']

/**
 * Hostnames (in `URL#hostname` form, IPv6 bracketed) this server may be
 * reached by: loopback always, plus the listener's own bind address. Since
 * dsh 0.2.1 that is one concrete interface address (the wildcard is rejected
 * at load), the same pair the harness's own `/api` fence accepts without a
 * `--trusted-host` entry. A `%zone` never appears in a `Host` header, so it's
 * dropped before comparing.
 */
function allowedHostnames(bindHost: string): Set<string> {
  const allowed = new Set(LOOPBACK_HOSTNAMES)
  const address = bindHost.split('%')[0]!
  const bindHostname = parseUrl(`http://${address.includes(':') ? `[${address}]` : address}`)?.hostname
  if (bindHostname !== undefined) allowed.add(bindHostname)
  return allowed
}

/** Parse a `Host`/`Origin` authority, or `undefined` when malformed. */
function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function effectivePort(url: URL): string {
  return url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80'
}

/**
 * A minimal same-origin guard for the one raw `ctx.webServer` route left:
 * chart images. The Settings API lives on Connection's `/api` channel, which
 * applies the harness's own fence plus cookie authentication (see
 * `routes.ts`). A plain `ctx.webServer.register()` route gets neither, and
 * chart images can't carry the cookie (they're loaded by `<img>` tags,
 * including from the desktop app's non-same-site page), so this reproduces
 * the fence:
 *
 * - `Host` must name this server: a loopback name or its bind address, on the
 *   server's port (a port-less `Host` defaults per the listener's protocol).
 *   This is the DNS-rebinding defense: a rebound page's requests carry the
 *   attacker's hostname in `Host`, even though they reach 127.0.0.1.
 * - `Origin`, when present, must be exactly this `Host` (same-origin). Browsers
 *   omit `Origin` on some same-origin GETs; a non-browser client (curl, a
 *   test) may omit it entirely. Either is fine once `Host` has passed.
 */
export function isTrustedRequest(ctx: Context, req: IncomingMessage): boolean {
  const hostHeader = req.headers.host
  if (hostHeader === undefined) return false
  const host = parseUrl(`${ctx.webServer.protocol}//${hostHeader}`)
  if (host === undefined || host.pathname !== '/' || host.username !== '' || host.password !== '') return false
  if (effectivePort(host) !== String(ctx.webServer.port)) return false
  if (!allowedHostnames(ctx.webServer.host).has(host.hostname)) return false

  const originHeader = req.headers.origin
  if (originHeader === undefined) return true
  const origin = parseUrl(originHeader)
  if (origin === undefined || (origin.protocol !== 'http:' && origin.protocol !== 'https:')) return false
  return origin.hostname === host.hostname && effectivePort(origin) === effectivePort(host)
}
