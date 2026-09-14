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
  readonly id: string
  readonly engine: DataSourceRecord['engine']
  readonly host?: string
  readonly port?: number
  readonly database: string
  readonly user?: string
  readonly passwordEnv?: string
  readonly ssl?: boolean
  readonly readOnly: boolean
  readonly description?: string
}

/** Errors that already-closed connections raise on a second close; safe to swallow during teardown. */
function isAlreadyClosedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code
  return code === 'ERR_SQLITE_ERROR' || code === 'PROTOCOL_ENQUEUE_AFTER_QUIT' || code === 'PROTOCOL_CONNECTION_LOST'
}

/**
 * Registry of named external database connections (`ctx.dataAgent`).
 * `sources.json` is eager-loaded at construction; individual DB connections
 * are opened lazily per source id — one unreachable legacy DB never blocks
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

  async get(id: string): Promise<DataSourceRecord | undefined> {
    await this.guardReady()
    return this.records.get(id)
  }

  async addSource(input: AddSourceInput): Promise<DataSourceRecord> {
    await this.guardReady()
    const record: DataSourceRecord = { ...input, createdAt: new Date().toISOString() }

    const next = await mutateSources((current) => {
      if (current.some(existing => existing.id === input.id)) {
        throw new DataAgentError(`A data source named "${input.id}" already exists`, DUPLICATE_SOURCE_CODE)
      }
      return { next: [...current, record], result: record }
    })

    this.records.set(next.id, next)
    return next
  }

  /** Idempotent: removing an unknown id returns `found: false` rather than throwing. */
  async removeSource(id: string): Promise<{ id: string, found: boolean }> {
    await this.guardReady()
    const found = await mutateSources((current) => {
      const exists = current.some(existing => existing.id === id)
      return { next: exists ? current.filter(existing => existing.id !== id) : current, result: exists }
    })

    this.records.delete(id)
    const liveAdapter = this.live.get(id)
    this.live.delete(id)
    if (liveAdapter !== undefined) {
      try {
        await (await liveAdapter).close()
      } catch (error) {
        if (!isAlreadyClosedError(error)) throw error
      }
    }
    await clearSourceComments(id)

    return { id, found }
  }

  async setReadOnly(id: string, readOnly: boolean): Promise<DataSourceRecord> {
    await this.guardReady()
    const next = await mutateSources((current) => {
      const index = current.findIndex(existing => existing.id === id)
      if (index === -1) throw new DataAgentError(`No data source named "${id}"`, SOURCE_NOT_FOUND_CODE)
      const existing = current[index]
      if (existing === undefined) throw new DataAgentError(`No data source named "${id}"`, SOURCE_NOT_FOUND_CODE)
      const updated: DataSourceRecord = { ...existing, readOnly }
      const updatedList = [...current]
      updatedList[index] = updated
      return { next: updatedList, result: updated }
    })

    this.records.set(id, next)
    // A read-only-flag change must reach the next connection: drop the live
    // adapter (SQLite's OS-level read-only mode is fixed at open time).
    const liveAdapter = this.live.get(id)
    this.live.delete(id)
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
  async getAdapter(id: string): Promise<DataSourceAdapter> {
    await this.guardReady()
    const record = this.records.get(id)
    if (record === undefined) throw new DataAgentError(`No data source named "${id}"`, SOURCE_NOT_FOUND_CODE)

    const existing = this.live.get(id)
    if (existing !== undefined) return existing

    const opening = (async () => {
      const adapter = await createAdapter(this.ctx, record)
      await adapter.connect()
      return adapter
    })()
    this.live.set(id, opening)

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
    for (const record of records) this.records.set(record.id, record)
  }
}
