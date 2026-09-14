import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'data-agent'

export interface Config {
  verbose: boolean
}

export const Config: Schema<Config> = Schema.object({
  verbose: Schema.boolean().default(false),
})

export function apply(_ctx: Context, config: Config) {
  if (config.verbose) {
    console.log('[data-agent] plugin loaded')
  }
}
