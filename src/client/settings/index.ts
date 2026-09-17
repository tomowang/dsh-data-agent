import type { Context } from '@deepseek-ai/cordis'
import { DataAgentPanel } from './DataAgentPanel.tsx'
import { registerSettingsNavIcon } from './settings-nav-icon.ts'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this section. */
const NS = 'settings.data-sources'

/**
 * Registers `data-sources` as its own top-level Settings nav entry (a
 * `settings.section` list-slot registration — the same mechanism
 * `ui-settings-models`/`ui-settings-plugins`/`ui-agent-preset` use for their
 * own sections), satisfying "its own menu entry" directly. The shell's nav
 * icon lookup is a hardcoded id-keyed table that falls back to a generic
 * gear icon for unrecognized ids, and `settings.section` has no icon field
 * to carry one through — so `registerSettingsNavIcon` (settings-nav-icon.ts)
 * applies the DOM-marker + CSS-mask workaround the DSH-better-sidebar
 * plugin uses for its own section, swapping in a database glyph instead.
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

    ctx.effect(
      () => registerSettingsNavIcon(() => t('nav')),
      'dsh-data-agent: settings navigation icon',
    )

    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'data-sources',
      order: 999,
      label: () => t('nav'),
      locale: NS,
    }, DataAgentPanel))
  },
}
