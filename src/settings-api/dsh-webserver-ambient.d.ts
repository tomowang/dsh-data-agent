// Local ambient typing for `ctx.webServer`. Deliberately NOT depending on the
// published `@deepseek-ai/dsh-host-webserver` package: its npm release
// (0.0.1-rc.1) predates a rename in the current monorepo source at the
// installed `dsh` CLI's version line — the published package still uses
// `ctx.httpServer`/`HttpServerService`, while the current source (verified
// directly against packages/host/webserver/src/index.ts at dsh-v0.2.1-rc.2)
// uses `ctx.webServer`/`WebServer`. Depending on the stale package would
// either fail to compile against the real key or silently type-check against
// the wrong one.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface WebRoute {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }

  interface WebServerService {
    /**
     * The configured bind address: one concrete IPv4 or IPv6 literal, possibly
     * with a `%zone`. Since dsh 0.2.1 the wildcard (`0.0.0.0`, `::`) is
     * rejected at load.
     */
    readonly host: string
    /** The listening port, or `undefined` before the listener binds. */
    readonly port: number | undefined
    /** `'https:'` when the listener is configured with TLS. */
    readonly protocol: 'http:' | 'https:'
    /**
     * The root URL local clients use to reach the listener, e.g.
     * `http://127.0.0.1:3080` (IPv6 hosts bracketed). Throws before the
     * listener binds, or when the bind address carries a non-loopback zone id.
     */
    getOrigin(): string
    register(route: WebRoute): () => void
  }

  interface Context {
    webServer: WebServerService
  }
}
