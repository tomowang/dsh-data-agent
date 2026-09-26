import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSources, setReadOnly } from '../../src/client/settings/api.ts'

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ sources: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('settings API client', () => {
  it('uses a document-relative URL, so the page works under a reverse-proxy subpath', async () => {
    const fetch = stubFetch()
    await listSources()
    const [url] = fetch.mock.calls[0]! as unknown as [string]
    expect(url).toBe('api/dsh-data-agent/list-sources')
    expect(url.startsWith('/')).toBe(false)
    // Resolved the way a browser resolves it against `<base href="./">` at a mount.
    expect(new URL(url, 'https://host.example/tools/dsh/').pathname).toBe('/tools/dsh/api/dsh-data-agent/list-sources')
  })

  it('sends every call as a JSON POST', async () => {
    const fetch = stubFetch()
    await listSources()
    await setReadOnly('prod', true)
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({ 'content-type': 'application/json' })
    }
    expect(JSON.parse((fetch.mock.calls[1]! as unknown as [string, RequestInit])[1].body as string)).toEqual({ name: 'prod', readOnly: true })
  })

  it('explains the harness\'s own non-JSON rejections instead of failing to parse them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    await expect(listSources()).rejects.toThrow(/Not signed in to dsh/)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    await expect(listSources()).rejects.toThrow(/untrusted host or origin/)
  })

  it('surfaces a route\'s own JSON error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'No data source named "x"' }), { status: 404 })))
    await expect(setReadOnly('x', true)).rejects.toThrow('No data source named "x"')
  })
})
