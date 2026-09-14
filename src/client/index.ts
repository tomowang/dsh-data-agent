import type { Context } from '@deepseek-ai/cordis'

// Milestone 0 placeholder: proves the browser-bundle contract (banner/footer,
// externals, dsh.client manifest wiring) actually loads inside a real running
// `web` profile before any real card is built on top of it. Replaced by the
// real client plugin (tool.call.toolview + settings.section registrations)
// once this is verified.
export const inject = ['slots']

export function apply(_ctx: Context): void {
  console.log('[dsh-data-agent] client bundle factory executed')
}
