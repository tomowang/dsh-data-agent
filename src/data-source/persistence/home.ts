import { mkdir } from 'node:fs/promises'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

const PLUGIN_DIR = 'dsh-data-agent'

/** Absolute path to `<dsh-home>/dsh-data-agent/<segments...>`. */
export function pluginHomePath(...segments: string[]): string {
  return dshHomePath(PLUGIN_DIR, ...segments)
}

/**
 * Ensure the plugin's own directory under the dsh home exists.
 * `withFileLock` requires its target's parent directory to already exist.
 */
export async function ensurePluginHomeDir(): Promise<void> {
  await mkdir(pluginHomePath(), { recursive: true, mode: 0o700 })
}
