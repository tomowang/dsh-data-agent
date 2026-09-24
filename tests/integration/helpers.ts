import type { DataSourceRecord, Engine } from '../../src/data-source/types.ts'

/**
 * Integration tests run against real databases (see `.github/workflows/ci.yml`
 * and `docker-compose.yml`). Each engine's suite is skipped unless it's listed
 * in `DSH_DA_IT_ENGINES` (e.g. `postgres,mysql,clickhouse`), so a plain
 * `pnpm test` without databases stays green.
 */
export function engineEnabled(engine: Engine): boolean {
  return (process.env.DSH_DA_IT_ENGINES ?? '').split(',').map(entry => entry.trim()).includes(engine)
}

/** Every service shares one password, read through the adapters' own `DSH_DA_*` passwordEnv path. */
export const PASSWORD_ENV = 'DSH_DA_IT_PASSWORD'
process.env[PASSWORD_ENV] ??= 'pw'

export function password(): string {
  return process.env[PASSWORD_ENV]!
}

export const HOST = process.env.DSH_DA_IT_HOST ?? '127.0.0.1'

/** The database every service creates at startup (`POSTGRES_DB`/`MYSQL_DATABASE`/`CLICKHOUSE_DB`). */
export const DATABASE = 'it'

export const ROW_COUNT = 1000

export function sourceRecord(engine: Engine, overrides: Partial<DataSourceRecord>): DataSourceRecord {
  return {
    name: `it-${engine}`,
    engine,
    host: HOST,
    database: DATABASE,
    passwordEnv: PASSWORD_ENV,
    readOnly: true,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  }
}

/** `2026-01-01T00:00:00Z` plus `n` minutes — the `created` value every engine seeds for row `n`. */
export function seededTimestamp(n: number): Date {
  return new Date(Date.UTC(2026, 0, 1) + n * 60_000)
}

/** Long enough for seeding a fresh container; the per-test timeouts under test are ~1s. */
export const HOOK_TIMEOUT_MS = 60_000

/**
 * Retry `attempt` until it succeeds. Official database images can briefly pass
 * their health check from a temporary init-time server and then restart, so
 * the first connection may be refused.
 */
export async function retry<T>(attempt: () => Promise<T>, tries = 30, delayMs = 1000): Promise<T> {
  for (let remaining = tries; ; remaining--) {
    try {
      return await attempt()
    } catch (error) {
      if (remaining <= 1) throw error
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}
