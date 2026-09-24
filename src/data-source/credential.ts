import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/**
 * Every `passwordEnv` must carry this prefix. Without it, a source could name
 * any variable on the host process (`DEEPSEEK_API_KEY`, a cloud token, ...)
 * and a connection to an arbitrary host would hand that secret over as the
 * "password". The prefix confines this plugin to secrets the user deliberately
 * exported for it.
 */
export const PASSWORD_ENV_PREFIX = 'DSH_DA_'
const PASSWORD_ENV_PATTERN = /^DSH_DA_[A-Za-z0-9_]+$/

/** Throws a plain (input-validation) `Error` unless `name` is a `DSH_DA_*` variable name. */
export function assertAllowedPasswordEnv(name: string): void {
  if (!PASSWORD_ENV_PATTERN.test(name)) {
    throw new Error(
      `passwordEnv "${name}" is not allowed: it must be an environment variable name starting with `
      + `${PASSWORD_ENV_PREFIX} (letters, digits, and underscores only), e.g. ${PASSWORD_ENV_PREFIX}PROD_DB_PASSWORD.`,
    )
  }
}

/**
 * Resolve a data source's password from its `passwordEnv` reference (an
 * environment variable name, never a stored value). Soft-checks
 * `ctx.get('credentials')` — never `inject` — so the plugin degrades to plain
 * `process.env` when that harness seam isn't mounted, instead of failing to
 * load. Never cached beyond the caller's own connection attempt, so a
 * credential rotation is picked up the next time a connection opens.
 *
 * The prefix is re-checked here, at the point of use, not just when a source
 * is saved — so a `sources.json` written before the rule existed (or edited
 * by hand) can't bypass it.
 */
export async function resolveSecret(ctx: Context, passwordEnv: string | undefined): Promise<string | undefined> {
  if (passwordEnv === undefined) return undefined
  assertAllowedPasswordEnv(passwordEnv)

  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const resolved = await credentials.resolve(credentialRef(passwordEnv))
    if (resolved !== undefined) return resolved.value
  }

  const ambient = process.env[passwordEnv]
  return ambient !== undefined && ambient.length > 0 ? ambient : undefined
}
