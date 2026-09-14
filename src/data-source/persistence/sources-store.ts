import { readFile } from 'node:fs/promises'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import type { DataSourceRecord } from '../types.ts'
import { ensurePluginHomeDir, pluginHomePath } from './home.ts'

function sourcesPath(): string {
  return pluginHomePath('sources.json')
}

/**
 * Lock-free read of the current connection registry. Safe without
 * `withFileLock` because every write commits via an atomic rename
 * (`writeFileAtomic`) — a reader observes either the old or the new complete
 * content, never a partial write.
 */
export async function readSources(): Promise<DataSourceRecord[]> {
  try {
    const content = await readFile(sourcesPath(), 'utf8')
    return JSON.parse(content) as DataSourceRecord[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Atomically read-validate-write the connection registry, serialized across
 * processes by `withFileLock`. `mutate` reads the freshly-loaded current
 * state (not any caller-held copy, which may be stale relative to another
 * process) and either returns the next state to persist or throws to abort
 * the write entirely — the lock releases on both outcomes, and a thrown
 * mutation leaves the file untouched.
 */
export async function mutateSources<T>(
  mutate: (current: readonly DataSourceRecord[]) => { next: readonly DataSourceRecord[], result: T },
): Promise<T> {
  await ensurePluginHomeDir()
  return withFileLock(sourcesPath(), async () => {
    const current = await readSources()
    const { next, result } = mutate(current)
    await writeFileAtomic(sourcesPath(), JSON.stringify(next, null, 2), { mode: 0o600, dirMode: 0o700 })
    return result
  })
}
