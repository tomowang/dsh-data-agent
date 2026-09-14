import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { isTrustedOrigin } from '../../src/settings-api/trust.ts'

function fakeCtx(host: '127.0.0.1' | '0.0.0.0', port: number) {
  return { webServer: { host, port } } as Parameters<typeof isTrustedOrigin>[0]
}

function fakeReq(origin: string | undefined): IncomingMessage {
  return { headers: { origin } } as unknown as IncomingMessage
}

describe('isTrustedOrigin', () => {
  it('trusts a request with no Origin header', () => {
    expect(isTrustedOrigin(fakeCtx('127.0.0.1', 3080), fakeReq(undefined))).toBe(true)
  })

  it('trusts a matching 127.0.0.1 Origin', () => {
    expect(isTrustedOrigin(fakeCtx('127.0.0.1', 3080), fakeReq('http://127.0.0.1:3080'))).toBe(true)
  })

  it('trusts a matching localhost Origin regardless of configured host', () => {
    expect(isTrustedOrigin(fakeCtx('127.0.0.1', 3080), fakeReq('http://localhost:3080'))).toBe(true)
  })

  it('rejects a mismatched port', () => {
    expect(isTrustedOrigin(fakeCtx('127.0.0.1', 3080), fakeReq('http://127.0.0.1:9999'))).toBe(false)
  })

  it('rejects a mismatched host', () => {
    expect(isTrustedOrigin(fakeCtx('127.0.0.1', 3080), fakeReq('http://evil.example:3080'))).toBe(false)
  })

  it('rejects a malformed Origin header', () => {
    expect(isTrustedOrigin(fakeCtx('127.0.0.1', 3080), fakeReq('not-a-url'))).toBe(false)
  })
})
