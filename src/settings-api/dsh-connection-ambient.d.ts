// Local ambient typing for the Host half of `ctx.connection` — only the exact
// Fetch-route registry this plugin uses. Same rationale as
// dsh-webserver-ambient.d.ts: the published `@deepseek-ai/dsh-client-connection`
// (0.0.1-rc.1) is far behind the harness. Verified against
// packages/client/connection/src/rpc.ts at dsh-v0.1.7-rc.2; the registry has
// existed since the 0.1.5 line.
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  /** One exact route on the harness's shared `/api` channel. */
  interface ConnectionFetchRoute {
    /** Absolute path below `/api`; query parameters stay on the request URL. */
    readonly path: string
    /** Methods this route owns; other methods fall through to the channel's normal dispatch. */
    readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
    /** `buffered` bodies obey the harness's JSON size cap (413 beyond it). */
    readonly requestBody: 'buffered' | 'streaming'
    /** Runs only after the harness's Host/Origin fence (403) and browser-session authentication (401). */
    readonly fetch: (request: Request) => Promise<Response>
  }

  interface HostConnectionService {
    readonly fetch: {
      /** Register one exact route; returns the asynchronous disposer removing it. */
      register(route: ConnectionFetchRoute): () => Promise<void>
    }
  }

  interface Context {
    connection: HostConnectionService
  }
}
