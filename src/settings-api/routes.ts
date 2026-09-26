import type { Context } from '@deepseek-ai/cordis'
import { getSourceComments, setComment } from '../data-source/persistence/comments-store.ts'
import { DataAgentError, SOURCE_NOT_FOUND_CODE } from '../data-source/errors.ts'
import { mergeSchemaComments } from '../data-source/schema-comments.ts'
import { ENGINES, SSL_MODES } from '../data-source/types.ts'
import {
  optionalBoolean,
  optionalEnum,
  optionalNullableBoolean,
  optionalNullableEnum,
  optionalNullableNumber,
  optionalNullableString,
  optionalNumber,
  optionalString,
  requireEnum,
  requireString,
} from '../tools/tool-types.ts'
import { SETTINGS_API_PATH } from './protocol.ts'

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (raw.length === 0) return {}
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('request body must be a JSON object')
  }
  return value as Record<string, unknown>
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

  // Field types are checked strictly here, with the chat tools' own helpers:
  // a wrong-typed field is a 400, never silently dropped. What a valid record
  // is (a real engine, a port in range, ...) is the registry's to check, for
  // chat and Settings alike.
  jsonRoute(ctx, 'add-source', async body => ctx.dataAgent.addSource({
    name: requireString(body, 'name', 'add-source'),
    engine: requireEnum(body, 'engine', ENGINES, 'add-source'),
    database: requireString(body, 'database', 'add-source'),
    host: optionalString(body, 'host', 'add-source'),
    port: optionalNumber(body, 'port', 'add-source'),
    user: optionalString(body, 'user', 'add-source'),
    passwordEnv: optionalString(body, 'passwordEnv', 'add-source'),
    ssl: optionalBoolean(body, 'ssl', 'add-source'),
    sslmode: optionalEnum(body, 'sslmode', SSL_MODES, 'add-source'),
    sslrootcert: optionalString(body, 'sslrootcert', 'add-source'),
    readOnly: optionalBoolean(body, 'readOnly', 'add-source') ?? true,
    description: optionalString(body, 'description', 'add-source'),
  }))

  jsonRoute(ctx, 'edit-source', async body => ctx.dataAgent.editSource(requireString(body, 'name', 'edit-source'), {
    host: optionalNullableString(body, 'host', 'edit-source'),
    port: optionalNullableNumber(body, 'port', 'edit-source'),
    database: optionalString(body, 'database', 'edit-source'),
    user: optionalNullableString(body, 'user', 'edit-source'),
    passwordEnv: optionalNullableString(body, 'passwordEnv', 'edit-source'),
    ssl: optionalNullableBoolean(body, 'ssl', 'edit-source'),
    sslmode: optionalNullableEnum(body, 'sslmode', SSL_MODES, 'edit-source'),
    sslrootcert: optionalNullableString(body, 'sslrootcert', 'edit-source'),
    readOnly: optionalBoolean(body, 'readOnly', 'edit-source'),
    description: optionalNullableString(body, 'description', 'edit-source'),
  }))

  jsonRoute(ctx, 'remove-source', async body => ctx.dataAgent.removeSource(requireString(body, 'name', 'remove-source')))

  jsonRoute(ctx, 'test-connection', async (body) => {
    const adapter = await ctx.dataAgent.getAdapter(requireString(body, 'name', 'test-connection'))
    return adapter.testConnection()
  })

  // A strict boolean, never a coercion: `Boolean(undefined)` would silently
  // turn a malformed request into "make this source read-write".
  jsonRoute(ctx, 'set-read-only', async (body) => {
    const name = requireString(body, 'name', 'set-read-only')
    if (typeof body.readOnly !== 'boolean') throw new Error('"readOnly" is required and must be a boolean')
    return ctx.dataAgent.setReadOnly(name, body.readOnly)
  })

  jsonRoute(ctx, 'get-schema', async (body) => {
    const sourceName = requireString(body, 'sourceName', 'get-schema')
    const adapter = await ctx.dataAgent.getAdapter(sourceName)
    const schema = await adapter.getSchema({
      table: optionalString(body, 'table', 'get-schema'),
      schemaName: optionalString(body, 'schemaName', 'get-schema'),
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
    const sourceName = requireString(body, 'sourceName', 'set-comment')
    const table = requireString(body, 'table', 'set-comment')
    const column = optionalString(body, 'column', 'set-comment')
    const comment = optionalString(body, 'comment', 'set-comment') || null
    // Same check as da_set_comment: never persist comments for a source that doesn't exist.
    if (await ctx.dataAgent.get(sourceName) === undefined) {
      throw new DataAgentError(`No data source named "${sourceName}"`, SOURCE_NOT_FOUND_CODE)
    }
    await setComment(sourceName, table, column, comment)
    return { sourceName, table, column, comment }
  })
}
