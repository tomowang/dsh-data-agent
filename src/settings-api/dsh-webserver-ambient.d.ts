// Local ambient typing for `ctx.webServer`. Deliberately NOT depending on the
// published `@deepseek-ai/dsh-host-webserver` package: its npm release
// (0.0.1-rc.1) predates a rename in the current monorepo source at the
// installed `dsh` CLI's version line — the published package still uses
// `ctx.httpServer`/`HttpServerService`, while the current source (verified
// directly against packages/host/webserver/src/index.ts) uses
// `ctx.webServer`/`WebServer`. Depending on the stale package would either
// fail to compile against the real key or silently type-check against the
// wrong one.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface WebRoute {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }

  interface WebServerService {
    readonly host: '127.0.0.1' | '0.0.0.0'
    readonly port: number
    register(route: WebRoute): () => void
  }

  interface Context {
    webServer: WebServerService
  }
}
