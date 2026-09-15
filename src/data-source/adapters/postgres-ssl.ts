import type { DataSourceRecord } from '../types.ts'

/** The subset of `pg.Pool`'s `ssl` option this adapter ever produces. */
export type PostgresSslOption =
  | { rejectUnauthorized: boolean, ca?: string, checkServerIdentity?: () => undefined }
  | undefined

/**
 * The `ssl` pool configs to try, in order. `disable`/`require`/`verify-ca`/
 * `verify-full` are single-attempt: `pg` does its own SSLRequest handshake
 * and throws if the server's answer doesn't match what was asked for, so
 * there is nothing to retry. `allow`/`prefer` are libpq's *negotiated*
 * modes — the client tries one encryption state and, only if that whole
 * connection attempt fails, retries with the other. `pg` has no built-in
 * equivalent (an unwanted 'N' from the server's SSL negotiation surfaces as
 * a hard error, not a fallback), so the adapter performs the second
 * attempt itself; see `postgres-adapter.ts`.
 */
export function resolvePostgresSslAttempts(
  record: Pick<DataSourceRecord, 'sslmode' | 'sslrootcert'>,
  readFile: (path: string) => string,
): readonly PostgresSslOption[] {
  const encrypted: PostgresSslOption = { rejectUnauthorized: false }
  const mode = record.sslmode ?? 'disable'

  switch (mode) {
    case 'disable': return [undefined]
    case 'allow': return [undefined, encrypted]
    case 'prefer': return [encrypted, undefined]
    case 'require': return [encrypted]
    case 'verify-ca': return [{
      rejectUnauthorized: true,
      ca: record.sslrootcert !== undefined ? readFile(record.sslrootcert) : undefined,
      // Chain validation still runs (rejectUnauthorized: true); this only
      // skips the hostname check that distinguishes verify-ca from verify-full.
      checkServerIdentity: () => undefined,
    }]
    case 'verify-full': return [{
      rejectUnauthorized: true,
      ca: record.sslrootcert !== undefined ? readFile(record.sslrootcert) : undefined,
    }]
  }
}
