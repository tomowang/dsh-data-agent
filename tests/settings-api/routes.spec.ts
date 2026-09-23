import type { IncomingMessage, ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSourceRegistry } from '../../src/data-source/registry.ts'
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

interface FakeResponse {
  status: number | undefined
  body: unknown
}

function fakeReq(body: unknown, origin?: string): IncomingMessage {
  const raw = Buffer.from(JSON.stringify(body))
  const req = {
    method: 'POST',
    headers: { origin },
    async *[Symbol.asyncIterator]() { yield raw },
  }
  return req as unknown as IncomingMessage
}

function fakeRes(): { res: ServerResponse, result: FakeResponse } {
  const result: FakeResponse = { status: undefined, body: undefined }
  const res = {
    writeHead(status: number) { result.status = status; return res },
    end(payload: string) { result.body = JSON.parse(payload) },
  }
  return { res: res as unknown as ServerResponse, result }
}

async function createTestContext(): Promise<{ ctx: Context, routes: Map<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>>, dispose: () => Promise<void> }> {
  const ctx = new Context()
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>>()
  ctx.webServer = {
    host: '127.0.0.1',
    port: 3080,
    register: (route: { path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  }
  const fiber = await ctx.plugin(DataSourceRegistry)
  applySettingsApiRoutes(ctx)
  return { ctx, routes, dispose: () => fiber.dispose() }
}

describe('settings-api routes', () => {
  it('rejects a request from an untrusted origin with 403', async () => {
    const { routes, dispose } = await createTestContext()
    const { res, result } = fakeRes()
    await routes.get('/dsh-data-agent/api/list-sources')?.(fakeReq({}, 'http://evil.example'), res)
    expect(result.status).toBe(403)
    await dispose()
  })

  it('add-source, list-sources, get-schema, set-comment, remove-source round-trip', async () => {
    const { routes, dispose } = await createTestContext()

    const add = fakeRes()
    await routes.get('/dsh-data-agent/api/add-source')?.(
      fakeReq({ name: 'sample', engine: 'sqlite', database: dbFile, readOnly: true }),
      add.res,
    )
    expect(add.result.status).toBe(200)
    expect((add.result.body as { name: string }).name).toBe('sample')

    const list = fakeRes()
    await routes.get('/dsh-data-agent/api/list-sources')?.(fakeReq({}), list.res)
    expect((list.result.body as { sources: { name: string }[] }).sources.map(s => s.name)).toEqual(['sample'])

    const setComment = fakeRes()
    await routes.get('/dsh-data-agent/api/set-comment')?.(
      fakeReq({ sourceName: 'sample', table: 'orders', comment: 'Customer orders' }),
      setComment.res,
    )
    expect(setComment.result.status).toBe(200)

    const schema = fakeRes()
    await routes.get('/dsh-data-agent/api/get-schema')?.(fakeReq({ sourceName: 'sample' }), schema.res)
    expect(schema.result.status).toBe(200)
    expect((schema.result.body as { tables: { name: string, comment?: string }[] }).tables).toEqual([
      { name: 'orders', comment: 'Customer orders', columnCount: 2 },
    ])

    const remove = fakeRes()
    await routes.get('/dsh-data-agent/api/remove-source')?.(fakeReq({ name: 'sample' }), remove.res)
    expect(remove.result.body).toEqual({ name: 'sample', found: true })

    await dispose()
  })

  it('edit-source patches provided fields and clears explicit nulls, leaving omitted fields untouched', async () => {
    const { routes, dispose } = await createTestContext()

    await routes.get('/dsh-data-agent/api/add-source')?.(
      fakeReq({ name: 'sample', engine: 'mysql', host: 'db1.internal', database: 'app', user: 'root', readOnly: true }),
      fakeRes().res,
    )

    const edit = fakeRes()
    await routes.get('/dsh-data-agent/api/edit-source')?.(
      fakeReq({ name: 'sample', host: 'db2.internal', user: null }),
      edit.res,
    )
    expect(edit.result.status).toBe(200)
    const updated = edit.result.body as { host?: string, user?: string, database: string }
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

    const { res, result } = fakeRes()
    await routes.get('/dsh-data-agent/api/list-tools')?.(fakeReq({}), res)
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
    await routes.get('/dsh-data-agent/api/add-source')?.(
      fakeReq({ name: 'sample', engine: 'sqlite', database: dbFile, readOnly: true }),
      fakeRes().res,
    )

    for (const body of [{ name: 'sample' }, { name: 'sample', readOnly: 'false' }]) {
      const { res, result } = fakeRes()
      await routes.get('/dsh-data-agent/api/set-read-only')?.(fakeReq(body), res)
      expect(result.status).toBe(400)
    }

    const list = fakeRes()
    await routes.get('/dsh-data-agent/api/list-sources')?.(fakeReq({}), list.res)
    expect((list.result.body as { sources: { readOnly: boolean }[] }).sources[0]!.readOnly).toBe(true)

    const set = fakeRes()
    await routes.get('/dsh-data-agent/api/set-read-only')?.(fakeReq({ name: 'sample', readOnly: false }), set.res)
    expect(set.result.status).toBe(200)
    expect((set.result.body as { readOnly: boolean }).readOnly).toBe(false)

    await dispose()
  })

  it('maps an unknown source name to a 404-shaped error, not a crash', async () => {
    const { routes, dispose } = await createTestContext()
    const { res, result } = fakeRes()
    await routes.get('/dsh-data-agent/api/test-connection')?.(fakeReq({ name: 'missing' }), res)
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ error: expect.stringContaining('missing') })
    await dispose()
  })
})
