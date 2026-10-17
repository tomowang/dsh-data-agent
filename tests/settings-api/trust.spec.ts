import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { isTrustedRequest } from '../../src/settings-api/trust.ts'

function fakeCtx(host: string, port = 3080, protocol: 'http:' | 'https:' = 'http:') {
  return { webServer: { host, port, protocol } } as Parameters<typeof isTrustedRequest>[0]
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

    it('treats a missing port as the listener protocol\'s default', () => {
      expect(isTrustedRequest(fakeCtx('127.0.0.1', 80), fakeReq('localhost'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('127.0.0.1', 443, 'https:'), fakeReq('localhost'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('127.0.0.1', 80, 'https:'), fakeReq('localhost'))).toBe(false)
    })

    it('on a non-loopback bind, also trusts the bind address itself, but no other interface or name', () => {
      expect(isTrustedRequest(fakeCtx('192.168.1.20'), fakeReq('192.168.1.20:3080'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('192.168.1.20'), fakeReq('localhost:3080'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('192.168.1.20'), fakeReq('192.168.1.21:3080'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('127.0.0.1'), fakeReq('192.168.1.20:3080'))).toBe(false)
      expect(isTrustedRequest(fakeCtx('192.168.1.20'), fakeReq('evil.example:3080'))).toBe(false)
    })

    it('matches an IPv6 bind address in its bracketed, normalized form, ignoring a zone id', () => {
      expect(isTrustedRequest(fakeCtx('FD00:0::1'), fakeReq('[fd00::1]:3080'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('fe80::1%eth0'), fakeReq('[fe80::1]:3080'))).toBe(true)
      expect(isTrustedRequest(fakeCtx('fd00::1'), fakeReq('[fd00::2]:3080'))).toBe(false)
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
