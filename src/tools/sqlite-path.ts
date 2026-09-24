import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { ToolInputError } from './tool-types.ts'

/**
 * Canonicalize `path` through symlinks and `..`. A file that doesn't exist yet
 * (a read-write source creates it on first connect) resolves via its parent
 * directory, which must exist.
 */
async function canonicalPath(path: string): Promise<string | undefined> {
  const absolute = resolve(path)
  try {
    return await realpath(absolute)
  } catch {
    try {
      return join(await realpath(dirname(absolute)), basename(absolute))
    } catch {
      return undefined
    }
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * A SQLite source's `database` is a file path the plugin opens with the
 * host user's permissions, so from chat — where a prompt-injected model
 * could aim it at a browser cookie store, or (read-write) create files
 * anywhere — it must land inside one of the user-approved `sqliteChatDirs`.
 * The Settings page, driven by the user directly, isn't restricted.
 *
 * `file:` URIs are rejected outright: `node:sqlite` interprets them itself
 * (`file:/abs/path?mode=rwc`), so they'd sidestep the path check below.
 */
export async function assertChatSqlitePath(path: string, allowedDirs: readonly string[], toolName: string): Promise<void> {
  const settingsHint = 'Ask the user to add or edit this source in Settings → Data Sources instead'
  if (path.toLowerCase().startsWith('file:')) {
    throw new ToolInputError(`${toolName}: SQLite "file:" URIs cannot be set from chat. ${settingsHint}.`)
  }

  const target = await canonicalPath(path)
  if (target !== undefined) {
    for (const dir of allowedDirs) {
      const root = await canonicalPath(dir)
      if (root !== undefined && isInside(target, root)) return
    }
  }

  const where = allowedDirs.length === 0
    ? 'no directories are approved for chat (the plugin\'s `sqliteChatDirs` config is empty)'
    : `it is not inside an approved directory (${allowedDirs.join(', ')})`
  throw new ToolInputError(
    `${toolName}: SQLite path "${path}" cannot be set from chat: ${where}. ${settingsHint}, `
    + 'or to add its directory to `sqliteChatDirs`.',
  )
}
