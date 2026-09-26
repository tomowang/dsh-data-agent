import { fork, type ChildProcess } from 'node:child_process'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONNECTION_FAILED_CODE, DataAgentError } from '../errors.ts'
import type {
  ConnectionTestResult,
  DataSourceAdapter,
  DataSourceRecord,
  GetSchemaOptions,
  QueryResult,
  RunQueryOptions,
  SchemaResult,
} from '../types.ts'
import { getQueryTimeoutMs, toJsonRow } from './adapter.ts'
import type { RawQueryResult, SqliteEnvelope, SqliteRequest, SqliteResponse } from './sqlite-child.ts'

/** The child entry beside this module: `.ts` when run from `src/`, `.js` from the built `lib/`. */
const CHILD_ENTRY = fileURLToPath(new URL(`./sqlite-child${extname(fileURLToPath(import.meta.url))}`, import.meta.url))

interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: NodeJS.Timeout
}

/**
 * SQLite via Node's built-in `node:sqlite` (confirmed available, no native
 * compilation) — the only engine with a second, OS-level read-only guarantee
 * on top of the AST gate (`sql/classify.ts`), and the only engine with no
 * native column/table comments (hence `comments.json` as an engine-agnostic
 * overlay).
 *
 * The database lives in a forked child process (`sqlite-child.ts`), not in
 * this one: `node:sqlite` runs synchronously with no interrupt hook, so a
 * runaway query (e.g. an unbounded recursive CTE) would otherwise block the
 * whole harness's event loop. A worker thread isn't enough either —
 * `Worker#terminate()` can't stop a thread stuck in native SQLite code. A
 * request that outlives `getQueryTimeoutMs()` SIGKILLs the child instead;
 * the next request forks a fresh one (until `close()`).
 */
export class SqliteAdapter implements DataSourceAdapter {
  private readonly record: DataSourceRecord
  private child: ChildProcess | undefined
  private opening: Promise<ChildProcess> | undefined
  private readonly pending = new Map<number, Pending>()
  private nextId = 0
  private closed = false

  // TypeScript parameter-property shorthand is intentionally avoided
  // throughout this plugin: the real `dsh` CLI loads out-of-tree plugin
  // source through Node's native type-stripping ("strip-only mode"), which
  // errors on parameter properties since they require actual code
  // generation, not just type erasure. Verified directly against a real
  // `dsh --profile web` boot, not assumed.
  constructor(record: DataSourceRecord) {
    this.record = record
  }

  async connect(): Promise<void> {
    await this.ensureChild()
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now()
    try {
      await this.request({ op: 'ping' })
      return { ok: true, latencyMs: Math.round(performance.now() - start) }
    } catch (error) {
      return { ok: false, error: { code: CONNECTION_FAILED_CODE, message: (error as Error).message } }
    }
  }

  async getSchema(options: GetSchemaOptions): Promise<SchemaResult> {
    return await this.request({ op: 'getSchema', options }) as SchemaResult
  }

  async runQuery(sql: string, options: RunQueryOptions): Promise<QueryResult> {
    const raw = await this.request({
      op: 'runQuery',
      sql,
      params: [...(options.params ?? [])],
      maxRows: options.maxRows,
    }) as RawQueryResult
    const truncated = raw.rows.length > options.maxRows
    const limited = raw.rows.slice(0, options.maxRows).map(toJsonRow)
    return { columns: raw.columns, rows: limited, rowCount: limited.length, truncated }
  }

  async close(): Promise<void> {
    this.closed = true
    const child = this.child
    if (child === undefined) return
    const exited = child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once('exit', resolve))
    // Idle: disconnecting lets the child close the database cleanly. Busy:
    // it can't read the disconnect until its query finishes, so kill it.
    // Re-ref'd so an awaited close() holds the event loop until the child is gone.
    child.ref()
    const idle = this.pending.size === 0 && child.connected
    this.discard(child, new Error('The SQLite connection was closed'))
    if (idle) child.disconnect()
    else child.kill('SIGKILL')
    await exited
  }

  private async request(request: SqliteRequest): Promise<unknown> {
    return this.send(await this.ensureChild(), request)
  }

  private ensureChild(): Promise<ChildProcess> {
    if (this.closed) return Promise.reject(new DataAgentError('SQLite adapter used after close()', CONNECTION_FAILED_CODE))
    this.opening ??= this.spawn().catch((error: unknown) => {
      this.opening = undefined
      throw error
    })
    return this.opening
  }

  private async spawn(): Promise<ChildProcess> {
    const child = fork(CHILD_ENTRY, [], {
      serialization: 'advanced',
      execArgv: ['--disable-warning=ExperimentalWarning'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    // Never hold the harness open on an idle child; a pending request's
    // timeout timer keeps the event loop alive while one is in flight.
    child.unref()
    child.channel?.unref()
    child.on('message', (response: SqliteResponse) => this.settle(response))
    child.on('error', error => this.discard(child, error))
    child.on('exit', () => this.discard(child, new Error('The SQLite process exited unexpectedly')))
    this.child = child

    try {
      await this.send(child, { op: 'open', name: this.record.name, path: this.record.database, readOnly: this.record.readOnly })
    } catch (error) {
      child.kill('SIGKILL')
      throw new DataAgentError(
        `Failed to open SQLite database at "${this.record.database}": ${(error as Error).message}`,
        CONNECTION_FAILED_CODE,
        { cause: error },
      )
    }
    return child
  }

  private send(child: ChildProcess, request: SqliteRequest): Promise<unknown> {
    const id = ++this.nextId
    const timeoutMs = getQueryTimeoutMs()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.discard(child, new Error(`SQLite query exceeded the ${timeoutMs} ms time limit and was stopped`))
        child.kill('SIGKILL')
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      const envelope: SqliteEnvelope = { id, request }
      child.send(envelope, (error) => {
        if (error !== null) this.discard(child, error)
      })
    })
  }

  private settle(response: SqliteResponse): void {
    const pending = this.pending.get(response.id)
    if (pending === undefined) return
    this.pending.delete(response.id)
    clearTimeout(pending.timer)
    if (response.ok) pending.resolve(response.value)
    else pending.reject(response.code !== undefined ? new DataAgentError(response.message, response.code) : new Error(response.message))
  }

  /** Forget a dead (or about-to-be-killed) child and fail everything still waiting on it. */
  private discard(child: ChildProcess, error: Error): void {
    if (this.child !== child) return
    this.child = undefined
    this.opening = undefined
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}
