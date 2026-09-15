import { Service, type Context } from '@deepseek-ai/cordis'
import { createAdapter } from './adapters/adapter.ts'
import { clearSourceComments } from './persistence/comments-store.ts'
import { mutateSources, readSources } from './persistence/sources-store.ts'
import {
  DUPLICATE_SOURCE_CODE,
  DataAgentError,
  REGISTRY_DISPOSED_CODE,
  SOURCE_NOT_FOUND_CODE,
} from './errors.ts'
import type { DataSourceAdapter, DataSourceRecord } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dataAgent: DataSourceRegistry
  }
}

export interface AddSourceInput {
  readonly name: string
  readonly engine: DataSourceRecord['engine']
  readonly host?: string
  readonly port?: number
  readonly database: string
  readonly user?: string
  readonly passwordEnv?: string
  readonly ssl?: boolean
  readonly sslmode?: DataSourceRecord['sslmode']
  readonly sslrootcert?: string
  readonly readOnly: boolean
  readonly description?: string
}

/** Errors that already-closed connections raise on a second close; safe to swallow during teardown. */
function isAlreadyClosedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code
  return code === 'ERR_SQLITE_ERROR' || code === 'PROTOCOL_ENQUEUE_AFTER_QUIT' || code === 'PROTOCOL_CONNECTION_LOST'
}

/** Drop explicit `undefined`-valued keys, e.g. from an omitted optional input field — `undefined` isn't valid JSON. */
function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/**
 * Registry of named external database connections (`ctx.dataAgent`).
 * `sources.json` is eager-loaded at construction; individual DB connections
 * are opened lazily per source name — one unreachable legacy DB never blocks
 * plugin startup, unlike E2B's single eagerly-opened sandbox. Every mutation
 * validates against the freshly-persisted state before committing, so the
 * in-memory map and sources.json never disagree.
 */
export class DataSourceRegistry extends Service {
  private records = new Map<string, DataSourceRecord>()
  private live = new Map<string, Promise<DataSourceAdapter>>()
  private disposed = false
  private readonly ready: Promise<void>

  constructor(ctx: Context) {
    super(ctx, 'dataAgent')
    this.ready = this.loadRecords()
    void this.ready.catch(() => {})

    ctx.effect(() => async () => {
      this.disposed = true
      const adapters = await Promise.allSettled([...this.live.values()])
      await Promise.allSettled(adapters.map(async (settled) => {
        if (settled.status !== 'fulfilled') return
        try {
          await settled.value.close()
        } catch (error) {
          if (!isAlreadyClosedError(error)) throw error
        }
      }))
      this.live.clear()
    }, 'dsh-data-agent connections teardown')
  }

  async list(): Promise<DataSourceRecord[]> {
    await this.guardReady()
    return [...this.records.values()]
  }

  async get(name: string): Promise<DataSourceRecord | undefined> {
    await this.guardReady()
    return this.records.get(name)
  }

  async addSource(input: AddSourceInput): Promise<DataSourceRecord> {
    await this.guardReady()
    const record: DataSourceRecord = { ...omitUndefined(input), createdAt: new Date().toISOString() }

    const next = await mutateSources((current) => {
      if (current.some(existing => existing.name === input.name)) {
        throw new DataAgentError(`A data source named "${input.name}" already exists`, DUPLICATE_SOURCE_CODE)
      }
      return { next: [...current, record], result: record }
    })

    this.records.set(next.name, next)
    return next
  }

  /** Idempotent: removing an unknown name returns `found: false` rather than throwing. */
  async removeSource(name: string): Promise<{ name: string, found: boolean }> {
    await this.guardReady()
    const found = await mutateSources((current) => {
      const exists = current.some(existing => existing.name === name)
      return { next: exists ? current.filter(existing => existing.name !== name) : current, result: exists }
    })

    this.records.delete(name)
    const liveAdapter = this.live.get(name)
    this.live.delete(name)
    if (liveAdapter !== undefined) {
      try {
        await (await liveAdapter).close()
      } catch (error) {
        if (!isAlreadyClosedError(error)) throw error
      }
    }
    await clearSourceComments(name)

    return { name, found }
  }

  async setReadOnly(name: string, readOnly: boolean): Promise<DataSourceRecord> {
    await this.guardReady()
    const next = await mutateSources((current) => {
      const index = current.findIndex(existing => existing.name === name)
      if (index === -1) throw new DataAgentError(`No data source named "${name}"`, SOURCE_NOT_FOUND_CODE)
      const existing = current[index]
      if (existing === undefined) throw new DataAgentError(`No data source named "${name}"`, SOURCE_NOT_FOUND_CODE)
      const updated: DataSourceRecord = { ...existing, readOnly }
      const updatedList = [...current]
      updatedList[index] = updated
      return { next: updatedList, result: updated }
    })

    this.records.set(name, next)
    // A read-only-flag change must reach the next connection: drop the live
    // adapter (SQLite's OS-level read-only mode is fixed at open time).
    const liveAdapter = this.live.get(name)
    this.live.delete(name)
    if (liveAdapter !== undefined) {
      try {
        await (await liveAdapter).close()
      } catch (error) {
        if (!isAlreadyClosedError(error)) throw error
      }
    }

    return next
  }

  /** Get (opening lazily on first use, memoized) the live adapter for a source. */
  async getAdapter(name: string): Promise<DataSourceAdapter> {
    await this.guardReady()
    const record = this.records.get(name)
    if (record === undefined) throw new DataAgentError(`No data source named "${name}"`, SOURCE_NOT_FOUND_CODE)

    const existing = this.live.get(name)
    if (existing !== undefined) return existing

    const opening = (async () => {
      const adapter = await createAdapter(this.ctx, record)
      await adapter.connect()
      return adapter
    })()
    this.live.set(name, opening)
    // A failed open must not be cached forever: evict it so the next call
    // (e.g. after fixing credentials) attempts a fresh connection instead of
    // permanently re-throwing the first failure.
    opening.catch(() => {
      if (this.live.get(name) === opening) this.live.delete(name)
    })

    if (this.disposed) throw new DataAgentError('Data source registry is disposing', REGISTRY_DISPOSED_CODE)
    const adapter = await opening
    if (this.disposed) throw new DataAgentError('Data source registry is disposing', REGISTRY_DISPOSED_CODE)
    return adapter
  }

  private async guardReady(): Promise<void> {
    if (this.disposed) throw new DataAgentError('Data source registry is disposing', REGISTRY_DISPOSED_CODE)
    await this.ready
    if (this.disposed) throw new DataAgentError('Data source registry is disposing', REGISTRY_DISPOSED_CODE)
  }

  private async loadRecords(): Promise<void> {
    const records = await readSources()
    for (const record of records) this.records.set(record.name, record)
  }
}
