import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { getSourceComments, setComment } from '../data-source/persistence/comments-store.ts'
import { DataAgentError } from '../data-source/errors.ts'
import { mergeSchemaComments } from '../data-source/schema-comments.ts'
import { isTrustedOrigin } from './trust.ts'

const ROUTE_PREFIX = '/dsh-data-agent/api'

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.length === 0) return {}
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/** Wrap one route handler with the trust check and uniform error-to-JSON mapping. */
function jsonRoute(
  ctx: Context,
  handler: (req: IncomingMessage, body: Record<string, unknown>) => Promise<unknown>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (!isTrustedOrigin(ctx, req)) {
      sendJson(res, 403, { error: 'Origin not trusted' })
      return
    }
    try {
      const body = req.method === 'GET' ? {} : await readJsonBody(req)
      const result = await handler(req, body)
      sendJson(res, 200, result)
    } catch (error) {
      const status = error instanceof DataAgentError ? 404 : 400
      sendJson(res, status, { error: (error as Error).message })
    }
  }
}

/**
 * Raw `ctx.webServer` routes backing the Settings-page data-source panel.
 * Every handler delegates to the SAME `DataSourceRegistry`/comments-store
 * methods the chat tools use — no duplicated business logic. This is the
 * documented, code-generation-free escape hatch for a Client feature that
 * needs to call back into Host logic without `ctx.remote`/`@Remote`, which
 * requires monorepo-internal Typert codegen and editing a closed, in-tree
 * mount list (`packages/api/remotes`) that an out-of-tree plugin cannot do.
 */
export function applySettingsApiRoutes(ctx: Context): void {
  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/list-sources`,
    handler: jsonRoute(ctx, async () => ({ sources: await ctx.dataAgent.list() })),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/add-source`,
    handler: jsonRoute(ctx, async (_req, body) => ctx.dataAgent.addSource({
      id: String(body.id ?? ''),
      engine: body.engine as 'mysql' | 'postgres' | 'sqlite',
      database: String(body.database ?? ''),
      host: typeof body.host === 'string' ? body.host : undefined,
      port: typeof body.port === 'number' ? body.port : undefined,
      user: typeof body.user === 'string' ? body.user : undefined,
      passwordEnv: typeof body.passwordEnv === 'string' ? body.passwordEnv : undefined,
      ssl: typeof body.ssl === 'boolean' ? body.ssl : undefined,
      readOnly: typeof body.readOnly === 'boolean' ? body.readOnly : true,
      description: typeof body.description === 'string' ? body.description : undefined,
    })),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/remove-source`,
    handler: jsonRoute(ctx, async (_req, body) => ctx.dataAgent.removeSource(String(body.id ?? ''))),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/test-connection`,
    handler: jsonRoute(ctx, async (_req, body) => {
      const adapter = await ctx.dataAgent.getAdapter(String(body.id ?? ''))
      return adapter.testConnection()
    }),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/set-read-only`,
    handler: jsonRoute(ctx, async (_req, body) =>
      ctx.dataAgent.setReadOnly(String(body.id ?? ''), Boolean(body.readOnly))),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/get-schema`,
    handler: jsonRoute(ctx, async (_req, body) => {
      const sourceId = String(body.sourceId ?? '')
      const adapter = await ctx.dataAgent.getAdapter(sourceId)
      const schema = await adapter.getSchema({
        table: typeof body.table === 'string' ? body.table : undefined,
        schemaName: typeof body.schemaName === 'string' ? body.schemaName : undefined,
      })
      const comments = await getSourceComments(sourceId)
      return mergeSchemaComments(schema, comments)
    }),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/set-comment`,
    handler: jsonRoute(ctx, async (_req, body) => {
      const sourceId = String(body.sourceId ?? '')
      const table = String(body.table ?? '')
      const column = typeof body.column === 'string' ? body.column : undefined
      const comment = typeof body.comment === 'string' && body.comment.length > 0 ? body.comment : null
      await setComment(sourceId, table, column, comment)
      return { sourceId, table, column, comment }
    }),
  })
}
