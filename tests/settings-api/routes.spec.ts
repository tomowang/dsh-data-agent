import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type ConnectionFetchRoute } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSourceRegistry } from '../../src/data-source/registry.ts'
import { SETTINGS_API_PATH } from '../../src/settings-api/protocol.ts'
import { applySettingsApiRoutes } from '../../src/settings-api/routes.ts'

let dshHome: string
let previousDshHome: string | undefined
let dbFile: string

beforeEach(async () => {
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-data-agent-test-'))
  previousDshHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome

  dbFile = join(dshHome, 'sample.db')
  const seed = new DatabaseSync(dbFile)
  seed.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT NOT NULL)')
  seed.close()
})

afterEach(async () => {
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  await rm(dshHome, { recursive: true, force: true })
})

type Routes = Map<string, ConnectionFetchRoute>

/**
 * Stand-in for the harness's `ctx.connection.fetch` registry. Like the real
 * one, a duplicate path throws and a route stays until its disposer runs. The
 * harness's own Host/Origin fence and cookie authentication run before a
 * route's `fetch`, so they are the harness's to test, not ours.
 */
async function createTestContext(): Promise<{ ctx: Context, routes: Routes, dispose: () => Promise<void> }> {
  const ctx = new Context()
  const routes: Routes = new Map()
  ctx.connection = {
    fetch: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`connection: exact Fetch route "${route.path}" is already registered`)
        routes.set(route.path, route)
        return async () => { routes.delete(route.path) }
      },
    },
  }
  const fiber = await ctx.plugin(DataSourceRegistry)
  applySettingsApiRoutes(ctx)
  return { ctx, routes, dispose: () => fiber.dispose() }
}

/** Call one Settings API route the way the harness would after authorizing the request. */
async function call(
  routes: Routes,
  name: string,
  body: unknown = {},
  contentType = 'application/json',
): Promise<{ status: number, body: unknown }> {
  const route = routes.get(`${SETTINGS_API_PATH}/${name}`)
  if (route === undefined) throw new Error(`no route for ${name}`)
  const response = await route.fetch(new Request(`http://127.0.0.1:3080${SETTINGS_API_PATH}/${name}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() }
}

describe('settings-api routes', () => {
  it('registers every route as an exact, buffered, POST-only route on the harness\'s authenticated /api channel', async () => {
    const { routes, dispose } = await createTestContext()
    expect([...routes.keys()].sort()).toEqual([
      'add-source', 'edit-source', 'get-schema', 'list-sources', 'list-tools',
      'remove-source', 'set-comment', 'set-read-only', 'test-connection',
    ].map(name => `/api/dsh-data-agent/${name}`))
    for (const route of routes.values()) {
      expect(route.methods).toEqual(['POST'])
      expect(route.requestBody).toBe('buffered')
    }
    await dispose()
  })

  it('removes its routes when its plugin unloads, so a reload (e.g. a config change) re-registers cleanly', async () => {
    const { ctx, routes, dispose } = await createTestContext()
    const count = routes.size
    routes.clear()

    const first = await ctx.plugin({ name: 'settings-api-first', apply: applySettingsApiRoutes })
    expect(routes.size).toBe(count)
    await first.dispose()
    expect(routes.size).toBe(0)

    const second = await ctx.plugin({ name: 'settings-api-second', apply: applySettingsApiRoutes })
    expect(routes.size).toBe(count)
    await second.dispose()
    await dispose()
  })

  it('requires a JSON body', async () => {
    const { routes, dispose } = await createTestContext()
    expect((await call(routes, 'remove-source', { name: 'x' }, 'text/plain')).status).toBe(415)
    expect((await call(routes, 'list-sources', {}, 'application/json; charset=utf-8')).status).toBe(200)
    await dispose()
  })

  it('add-source, list-sources, get-schema, set-comment, remove-source round-trip', async () => {
    const { routes, dispose } = await createTestContext()

    const add = await call(routes, 'add-source', { name: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })
    expect(add.status).toBe(200)
    expect((add.body as { name: string }).name).toBe('sample')

    const list = await call(routes, 'list-sources')
    expect((list.body as { sources: { name: string }[] }).sources.map(s => s.name)).toEqual(['sample'])

    const comment = await call(routes, 'set-comment', { sourceName: 'sample', table: 'orders', comment: 'Customer orders' })
    expect(comment.status).toBe(200)

    const schema = await call(routes, 'get-schema', { sourceName: 'sample' })
    expect(schema.status).toBe(200)
    expect((schema.body as { tables: { name: string, comment?: string }[] }).tables).toEqual([
      { name: 'orders', comment: 'Customer orders', columnCount: 2 },
    ])

    const remove = await call(routes, 'remove-source', { name: 'sample' })
    expect(remove.body).toEqual({ name: 'sample', found: true })

    await dispose()
  })

  it('edit-source patches provided fields and clears explicit nulls, leaving omitted fields untouched', async () => {
    const { routes, dispose } = await createTestContext()
    await call(routes, 'add-source', { name: 'sample', engine: 'mysql', host: 'db1.internal', database: 'app', user: 'root', readOnly: true })

    const edit = await call(routes, 'edit-source', { name: 'sample', host: 'db2.internal', user: null })
    expect(edit.status).toBe(200)
    const updated = edit.body as { host?: string, user?: string, database: string }
    expect(updated.host).toBe('db2.internal')
    expect('user' in updated).toBe(false)
    expect(updated.database).toBe('app')

    await dispose()
  })

  it('list-tools filters the host tool registry down to this plugin\'s da_* tools', async () => {
    const { ctx, routes, dispose } = await createTestContext()
    ctx.tools = {
      register: () => () => {},
      schemas: () => [
        { name: 'da_run_sql', description: 'Run SQL.', parameters: {} },
        { name: 'da_list_data_sources', description: 'List sources.', parameters: {} },
        { name: 'unrelated_plugin_tool', description: 'Not ours.', parameters: {} },
      ],
    }

    const result = await call(routes, 'list-tools')
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      tools: [
        { name: 'da_list_data_sources', description: 'List sources.' },
        { name: 'da_run_sql', description: 'Run SQL.' },
      ],
    })
    await dispose()
  })

  it('set-read-only rejects a missing or non-boolean readOnly instead of coercing it to read-write', async () => {
    const { routes, dispose } = await createTestContext()
    await call(routes, 'add-source', { name: 'sample', engine: 'sqlite', database: dbFile, readOnly: true })

    for (const body of [{ name: 'sample' }, { name: 'sample', readOnly: 'false' }]) {
      expect((await call(routes, 'set-read-only', body)).status).toBe(400)
    }
    const list = await call(routes, 'list-sources')
    expect((list.body as { sources: { readOnly: boolean }[] }).sources[0]!.readOnly).toBe(true)

    const set = await call(routes, 'set-read-only', { name: 'sample', readOnly: false })
    expect(set.status).toBe(200)
    expect((set.body as { readOnly: boolean }).readOnly).toBe(false)

    await dispose()
  })

  it('maps an unknown source name to a 404-shaped error, and a malformed body to 400, not a crash', async () => {
    const { routes, dispose } = await createTestContext()
    const missing = await call(routes, 'test-connection', { name: 'missing' })
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: expect.stringContaining('missing') })

    expect((await call(routes, 'list-sources', [1, 2])).status).toBe(400)
    await dispose()
  })
})
