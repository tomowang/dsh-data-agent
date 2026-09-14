import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/**
 * Resolve a data source's password from its `passwordEnv` reference (an
 * environment variable name, never a stored value). Soft-checks
 * `ctx.get('credentials')` — never `inject` — so the plugin degrades to plain
 * `process.env` when that harness seam isn't mounted, instead of failing to
 * load. Never cached beyond the caller's own connection attempt, so a
 * credential rotation is picked up the next time a connection opens.
 */
export async function resolveSecret(ctx: Context, passwordEnv: string | undefined): Promise<string | undefined> {
  if (passwordEnv === undefined) return undefined

  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const resolved = await credentials.resolve(credentialRef(passwordEnv))
    if (resolved !== undefined) return resolved.value
  }

  const ambient = process.env[passwordEnv]
  return ambient !== undefined && ambient.length > 0 ? ambient : undefined
}
