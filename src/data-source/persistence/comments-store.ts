import { readFile } from 'node:fs/promises'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { ensurePluginHomeDir, pluginHomePath } from './home.ts'

interface TableComments {
  comment?: string
  columns?: Record<string, string>
}

/** `sourceId -> tableName -> { comment?, columns?: { columnName -> comment } }`. */
type CommentsFile = Record<string, Record<string, TableComments>>

function commentsPath(): string {
  return pluginHomePath('comments.json')
}

async function readComments(): Promise<CommentsFile> {
  try {
    const content = await readFile(commentsPath(), 'utf8')
    return JSON.parse(content) as CommentsFile
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function mutateComments(mutate: (current: CommentsFile) => CommentsFile): Promise<void> {
  await ensurePluginHomeDir()
  await withFileLock(commentsPath(), async () => {
    const current = await readComments()
    const next = mutate(current)
    await writeFileAtomic(commentsPath(), JSON.stringify(next, null, 2), { mode: 0o600, dirMode: 0o700 })
  })
}

export async function getTableComment(sourceId: string, table: string): Promise<string | undefined> {
  const comments = await readComments()
  return comments[sourceId]?.[table]?.comment
}

export async function getColumnComment(sourceId: string, table: string, column: string): Promise<string | undefined> {
  const comments = await readComments()
  return comments[sourceId]?.[table]?.columns?.[column]
}

/** All comments for one source, keyed by table then column — used by `get_schema` to merge in one read. */
export async function getSourceComments(sourceId: string): Promise<Record<string, TableComments>> {
  const comments = await readComments()
  return comments[sourceId] ?? {}
}

/**
 * Set or clear (comment === null) a table or column comment. Omitting an
 * empty table/column entry after a clear keeps the file's structure minimal
 * (an untouched source round-trips to `{}`, not a tree of empty objects).
 */
export async function setComment(
  sourceId: string,
  table: string,
  column: string | undefined,
  comment: string | null,
): Promise<void> {
  await mutateComments((current) => {
    const next: CommentsFile = { ...current }
    const sourceEntry = { ...(next[sourceId] ?? {}) }
    const tableEntry: TableComments = { ...(sourceEntry[table] ?? {}) }

    if (column === undefined) {
      if (comment === null) delete tableEntry.comment
      else tableEntry.comment = comment
    } else {
      const columns = { ...(tableEntry.columns ?? {}) }
      if (comment === null) delete columns[column]
      else columns[column] = comment
      if (Object.keys(columns).length > 0) tableEntry.columns = columns
      else delete tableEntry.columns
    }

    if (Object.keys(tableEntry).length > 0) sourceEntry[table] = tableEntry
    else delete sourceEntry[table]

    if (Object.keys(sourceEntry).length > 0) next[sourceId] = sourceEntry
    else delete next[sourceId]

    return next
  })
}

/** Remove every comment for a source (called when the source itself is removed). */
export async function clearSourceComments(sourceId: string): Promise<void> {
  await mutateComments((current) => {
    const next = { ...current }
    delete next[sourceId]
    return next
  })
}
