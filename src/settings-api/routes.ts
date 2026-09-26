import type { Context } from '@deepseek-ai/cordis'
import { getSourceComments, setComment } from '../data-source/persistence/comments-store.ts'
import { DataAgentError } from '../data-source/errors.ts'
import { mergeSchemaComments } from '../data-source/schema-comments.ts'
import { SETTINGS_API_PATH } from './protocol.ts'

const SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (raw.length === 0) return {}
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

/** For an edit-source field: `null` in the body means "clear", anything else non-string means "leave as-is". */
function nullableString(value: unknown): string | null | undefined {
  if (typeof value === 'string') return value
  return value === null ? null : undefined
}

function nullableNumber(value: unknown): number | null | undefined {
  if (typeof value === 'number') return value
  return value === null ? null : undefined
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  if (typeof value === 'boolean') return value
  return value === null ? null : undefined
}

function nullableEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null | undefined {
  if ((allowed as readonly unknown[]).includes(value)) return value as T
  return value === null ? null : undefined
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** `application/json`, optionally with parameters such as `; charset=utf-8`. */
function isJsonContentType(request: Request): boolean {
  return request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/json'
}

/**
 * Register one Settings API route as an exact JSON-POST route on the
 * harness's shared `/api` channel. The harness authorizes every request
 * before `fetch` runs — its Host/Origin fence (DNS rebinding, cross-site;
 * 403) and the browser-session cookie issued when dsh opened the page
 * (401) — and caps buffered bodies (413). This handler adds only the JSON
 * content-type requirement and uniform error-to-JSON mapping.
 */
function jsonRoute(
  ctx: Context,
  name: string,
  handler: (body: Record<string, unknown>) => Promise<unknown>,
): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: `${SETTINGS_API_PATH}/${name}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (!isJsonContentType(request)) return jsonResponse(415, { error: 'Content-Type must be application/json' })
      try {
        return jsonResponse(200, await handler(await readJsonBody(request)))
      } catch (error) {
        return jsonResponse(error instanceof DataAgentError ? 404 : 400, { error: (error as Error).message })
      }
    },
  }), `dsh-data-agent: ${name} Settings API route`)
}

/**
 * Routes backing the Settings-page data-source panel, on the harness's
 * authenticated `/api` channel (`ctx.connection.fetch`). Every handler
 * delegates to the SAME `DataSourceRegistry`/comments-store methods the chat
 * tools use — no duplicated business logic. Exact Fetch routes are the
 * code-generation-free way for an out-of-tree plugin's Client half to call
 * back into Host logic: `ctx.remote`/`@Remote` requires monorepo-internal
 * Typert codegen and a closed, in-tree mount list (`packages/api/remotes`).
 */
export function applySettingsApiRoutes(ctx: Context): void {
  jsonRoute(ctx, 'list-sources', async () => ({ sources: await ctx.dataAgent.list() }))

  jsonRoute(ctx, 'add-source', async body => ctx.dataAgent.addSource({
    name: String(body.name ?? ''),
    engine: body.engine as 'mysql' | 'postgres' | 'sqlite' | 'clickhouse',
    database: String(body.database ?? ''),
    host: typeof body.host === 'string' ? body.host : undefined,
    port: typeof body.port === 'number' ? body.port : undefined,
    user: typeof body.user === 'string' ? body.user : undefined,
    passwordEnv: typeof body.passwordEnv === 'string' ? body.passwordEnv : undefined,
    ssl: typeof body.ssl === 'boolean' ? body.ssl : undefined,
    sslmode: (SSL_MODES as readonly unknown[]).includes(body.sslmode) ? body.sslmode as typeof SSL_MODES[number] : undefined,
    sslrootcert: typeof body.sslrootcert === 'string' ? body.sslrootcert : undefined,
    readOnly: typeof body.readOnly === 'boolean' ? body.readOnly : true,
    description: typeof body.description === 'string' ? body.description : undefined,
  }))

  jsonRoute(ctx, 'edit-source', async body => ctx.dataAgent.editSource(String(body.name ?? ''), {
    host: nullableString(body.host),
    port: nullableNumber(body.port),
    database: typeof body.database === 'string' ? body.database : undefined,
    user: nullableString(body.user),
    passwordEnv: nullableString(body.passwordEnv),
    ssl: nullableBoolean(body.ssl),
    sslmode: nullableEnum(body.sslmode, SSL_MODES),
    sslrootcert: nullableString(body.sslrootcert),
    readOnly: typeof body.readOnly === 'boolean' ? body.readOnly : undefined,
    description: nullableString(body.description),
  }))

  jsonRoute(ctx, 'remove-source', async body => ctx.dataAgent.removeSource(String(body.name ?? '')))

  jsonRoute(ctx, 'test-connection', async (body) => {
    const adapter = await ctx.dataAgent.getAdapter(String(body.name ?? ''))
    return adapter.testConnection()
  })

  // A strict boolean, never a coercion: `Boolean(undefined)` would silently
  // turn a malformed request into "make this source read-write".
  jsonRoute(ctx, 'set-read-only', async (body) => {
    if (typeof body.readOnly !== 'boolean') throw new Error('"readOnly" is required and must be a boolean')
    return ctx.dataAgent.setReadOnly(String(body.name ?? ''), body.readOnly)
  })

  jsonRoute(ctx, 'get-schema', async (body) => {
    const sourceName = String(body.sourceName ?? '')
    const adapter = await ctx.dataAgent.getAdapter(sourceName)
    const schema = await adapter.getSchema({
      table: typeof body.table === 'string' ? body.table : undefined,
      schemaName: typeof body.schemaName === 'string' ? body.schemaName : undefined,
    })
    const comments = await getSourceComments(sourceName)
    return mergeSchemaComments(schema, comments)
  })

  // `ctx.tools.schemas()` is the whole host's visible tool registry, not just
  // this plugin's — every da_* tool name is unique to this plugin, so the
  // prefix filter scopes it back down without duplicating each tool's
  // `description` string into a second, driftable list.
  jsonRoute(ctx, 'list-tools', async () => ({
    tools: ctx.tools.schemas()
      .filter(schema => schema.name.startsWith('da_'))
      .map(schema => ({ name: schema.name, description: schema.description }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))

  jsonRoute(ctx, 'set-comment', async (body) => {
    const sourceName = String(body.sourceName ?? '')
    const table = String(body.table ?? '')
    const column = typeof body.column === 'string' ? body.column : undefined
    const comment = typeof body.comment === 'string' && body.comment.length > 0 ? body.comment : null
    await setComment(sourceName, table, column, comment)
    return { sourceName, table, column, comment }
  })
}
