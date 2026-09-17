import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { applyChartImageRoutes, CHART_IMAGE_ROUTE_PREFIX, chartImageUrl } from '../src/tools/chart-image-routes.ts'
import { ChartImageStore } from '../src/tools/chart-image-store.ts'

function fakeReq(url: string, origin?: string): IncomingMessage {
  return { url, headers: { origin } } as unknown as IncomingMessage
}

interface FakeResponse {
  status: number | undefined
  headers: Record<string, string> | undefined
  body: Buffer | undefined
}

function fakeRes(): { res: ServerResponse, result: FakeResponse } {
  const result: FakeResponse = { status: undefined, headers: undefined, body: undefined }
  const res = {
    writeHead(status: number, headers?: Record<string, string>) { result.status = status; result.headers = headers; return res },
    end(payload?: Buffer) { result.body = payload },
  }
  return { res: res as unknown as ServerResponse, result }
}

async function createTestContext(): Promise<{ ctx: Context, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>, dispose: () => Promise<void> }> {
  const ctx = new Context()
  let handler: ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined
  ctx.webServer = {
    host: '127.0.0.1',
    port: 3080,
    register: (route: { handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => {
      handler = route.handler
      return () => { handler = undefined }
    },
  }
  const fiber = await ctx.plugin(ChartImageStore)
  applyChartImageRoutes(ctx)
  return { ctx, handler: handler!, dispose: () => fiber.dispose() }
}

describe('chartImageUrl', () => {
  it('builds an absolute http URL from the webServer host and port', () => {
    const ctx = new Context()
    // `ctx.provide`, not plain assignment: `chartImageUrl` reads via `ctx.get`, which
    // only sees names actually registered through Cordis's provide/service registry.
    ctx.provide('webServer', { host: '127.0.0.1', port: 3080, register: () => () => {} })
    expect(chartImageUrl(ctx, 'abc')).toBe(`http://127.0.0.1:3080${CHART_IMAGE_ROUTE_PREFIX}abc.png`)
  })

  it('substitutes localhost for 0.0.0.0, since trust.ts never trusts a literal 0.0.0.0 Origin', () => {
    const ctx = new Context()
    ctx.provide('webServer', { host: '0.0.0.0', port: 3080, register: () => () => {} })
    expect(chartImageUrl(ctx, 'abc')).toBe(`http://localhost:3080${CHART_IMAGE_ROUTE_PREFIX}abc.png`)
  })
})

describe('chart-image routes', () => {
  it('serves a stored PNG at its id', async () => {
    const { ctx, handler, dispose } = await createTestContext()
    const id = ctx.chartImageStore.put(Buffer.from('png-bytes'))

    const { res, result } = fakeRes()
    await handler(fakeReq(`${CHART_IMAGE_ROUTE_PREFIX}${id}.png`), res)

    expect(result.status).toBe(200)
    expect(result.headers?.['content-type']).toBe('image/png')
    expect(result.body).toEqual(Buffer.from('png-bytes'))
    await dispose()
  })

  it('404s on an unknown id', async () => {
    const { handler, dispose } = await createTestContext()
    const { res, result } = fakeRes()
    await handler(fakeReq(`${CHART_IMAGE_ROUTE_PREFIX}not-a-real-id.png`), res)
    expect(result.status).toBe(404)
    await dispose()
  })

  it('rejects a request from an untrusted origin with 403', async () => {
    const { ctx, handler, dispose } = await createTestContext()
    const id = ctx.chartImageStore.put(Buffer.from('png-bytes'))

    const { res, result } = fakeRes()
    await handler(fakeReq(`${CHART_IMAGE_ROUTE_PREFIX}${id}.png`, 'http://evil.example'), res)
    expect(result.status).toBe(403)
    await dispose()
  })
})
