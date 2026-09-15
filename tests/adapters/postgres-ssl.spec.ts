import { describe, expect, it } from 'vitest'
import { resolvePostgresSslAttempts } from '../../src/data-source/adapters/postgres-ssl.ts'

const failIfCalled = (): string => { throw new Error('readFile should not have been called') }
const unverified = { rejectUnauthorized: false }

describe('resolvePostgresSslAttempts', () => {
  it('tries only plaintext for disable', () => {
    expect(resolvePostgresSslAttempts({ sslmode: 'disable' }, failIfCalled)).toEqual([undefined])
  })

  it('defaults to disable when sslmode is unset', () => {
    expect(resolvePostgresSslAttempts({}, failIfCalled)).toEqual([undefined])
  })

  it('tries only encrypted, unverified for require', () => {
    expect(resolvePostgresSslAttempts({ sslmode: 'require' }, failIfCalled)).toEqual([unverified])
  })

  it('tries plaintext first, then encrypted, for allow', () => {
    expect(resolvePostgresSslAttempts({ sslmode: 'allow' }, failIfCalled)).toEqual([undefined, unverified])
  })

  it('tries encrypted first, then plaintext, for prefer', () => {
    expect(resolvePostgresSslAttempts({ sslmode: 'prefer' }, failIfCalled)).toEqual([unverified, undefined])
  })

  it('verifies the certificate chain but not the hostname for verify-ca', () => {
    const [attempt] = resolvePostgresSslAttempts({ sslmode: 'verify-ca' }, failIfCalled)
    expect(attempt).toMatchObject({ rejectUnauthorized: true, ca: undefined })
    expect(attempt?.checkServerIdentity?.()).toBeUndefined()
  })

  it('verifies the certificate chain and hostname for verify-full', () => {
    expect(resolvePostgresSslAttempts({ sslmode: 'verify-full' }, failIfCalled))
      .toEqual([{ rejectUnauthorized: true, ca: undefined }])
  })

  it('reads the CA certificate for verify-full when sslrootcert is set', () => {
    const readFile = (path: string): string => {
      expect(path).toBe('/etc/ssl/ca.pem')
      return 'PEM-CONTENT'
    }
    expect(resolvePostgresSslAttempts({ sslmode: 'verify-full', sslrootcert: '/etc/ssl/ca.pem' }, readFile))
      .toEqual([{ rejectUnauthorized: true, ca: 'PEM-CONTENT' }])
  })
})
