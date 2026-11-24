import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconDatabaseOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import { DataAgentPanel } from './DataAgentPanel.tsx'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this section. */
const NS = 'settings.data-sources'

/** Settings nav-rail icon rendered into the shell's `settings.section.icon` slot. */
function DataSourcesNavIcon({ size }: { size: number }): React.ReactElement {
  return React.createElement(IconDatabaseOutlineMedium, { size })
}

/**
 * Registers `data-sources` as its own top-level Settings nav entry (a
 * `settings.section` list-slot registration — the same mechanism
 * `ui-settings-models`/`ui-settings-plugins`/`ui-agent-preset` use for their
 * own sections), along with its database glyph via the `settings.section.icon`
 * slot (introduced in dsh 0.2.2) keyed by the same `id`.
 *
 * `locale` is declared in `inject` (not read with `ctx.get`) on purpose:
 * every reference settings section in the harness (ui-settings-general,
 * ui-settings-plugins, ui-agent-preset) hard-requires it the same way, since
 * `@deepseek-ai/dsh-client-locale` is boot-essential infrastructure the host
 * always provides — a plugin that instead *probes* for it with `ctx.get`
 * races the locale plugin's own fiber and can activate first, permanently
 * latching onto the pre-locale English fallback with no way to promote to
 * the real service once it does arrive a moment later.
 */
export const dataSourcesSettingsSection = {
  name: 'data-sources-settings-section',
  inject: ['slots', 'locale'],
  apply(ctx: Context): void {
    const t = ctx.locale.bind(NS)
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-data-agent: settings section dictionary')

    ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
      name: 'settings.section.icon',
      id: 'data-sources',
    }, DataSourcesNavIcon))

    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'data-sources',
      order: 999,
      label: () => t('nav'),
      locale: NS,
    }, DataAgentPanel))
  },
}
