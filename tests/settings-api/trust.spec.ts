import type { IncomingMessage } from 'node:http'
import { networkInterfaces } from 'node:os'
import { describe, expect, it } from 'vitest'
import { isTrustedRequest } from '../../src/settings-api/trust.ts'

function fakeCtx(host: '127.0.0.1' | '0.0.0.0', port = 3080) {
  return { webServer: { host, port } } as Parameters<typeof isTrustedRequest>[0]
}

function fakeReq(host: string | undefined, origin?: string): IncomingMessage {
  return { headers: { host, origin } } as unknown as IncomingMessage
}

describe('isTrustedRequest', () => {
  describe('Host header (DNS-rebinding defense)', () => {
    it('trusts every loopback name on the server port', () => {
      for (const host of ['127.0.0.1:3080', 'localhost:3080', 'LOCALHOST:3080', '[::1]:3080']) {
        expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq(host))).toBe(true)
      }
    })

    it('rejects a foreign hostname, even though the request reached a loopback socket', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('evil.example:3080'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1.evil.example:3080'))).toBe(false)
    })

    it('rejects the wrong port, a missing Host, and malformed values', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:9999'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq(undefined))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080/x'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('user@127.0.0.1:3080'))).toBe(false)
    })

    it('treats a missing port as 80', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1', 80), fakeReq('localhost'))).toBe(true)
    })

    it('on a 0.0.0.0 bind, also trusts this machine\'s own interface addresses, but still not foreign names', () => {
      const lanAddress = Object.values(networkInterfaces()).flat()
        .find(entry => entry?.family === 'IPv4' && !entry.internal)?.address
      if (lanAddress !== undefined) {
        expect(isTrustedRequest(fakeCtx('0.0.0.0'), fakeReq(`${lanAddress}:3080`))).toBe(true)
        expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq(`${lanAddress}:3080`))).toBe(false)
      }
      expect(isTrustedRequest(fakeCtx('0.0.0.0'), fakeReq('evil.example:3080'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('0.0.0.0'), fakeReq('0.0.0.0:3080'))).toBe(false)
    })
  })

  describe('Origin header', () => {
    it('trusts a request with no Origin once Host has passed', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080'))).toBe(true)
    })

    it('trusts an Origin that matches Host exactly', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080', 'http://127.0.0.1:3080'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('localhost:3080', 'http://localhost:3080'))).toBe(true)
    })

    it('rejects a cross-origin request, including another loopback name or port', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080', 'http://evil.example'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080', 'http://localhost:3080'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080', 'http://127.0.0.1:9999'))).toBe(false)
    })

    it('rejects a malformed, opaque, or non-http Origin', () => {
      for (const origin of ['not-a-url', 'null', 'file:///x']) {
        expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('127.0.0.1:3080', origin))).toBe(false)
      }
    })
  })
})
