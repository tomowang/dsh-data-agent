import type { Context } from '@deepseek-ai/cordis'
import { DataSourcesPanel } from './DataSourcesPanel.tsx'
import { registerSettingsNavIcon } from './settings-nav-icon.ts'

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
 */
const SECTION_LABEL = 'Data Sources'

export const dataSourcesSettingsSection = {
  name: 'data-sources-settings-section',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.effect(
      () => registerSettingsNavIcon(() => SECTION_LABEL),
      'dsh-data-agent: settings navigation icon',
    )

    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'data-sources',
      order: 999,
      label: () => SECTION_LABEL,
    }, DataSourcesPanel))
  },
}
