import type { Context } from '@deepseek-ai/cordis'
import { DataSourcesPanel } from './DataSourcesPanel.tsx'

/**
 * Registers `data-sources` as its own top-level Settings nav entry (a
 * `settings.section` list-slot registration — the same mechanism
 * `ui-settings-models`/`ui-settings-plugins`/`ui-agent-preset` use for their
 * own sections), satisfying "its own menu entry" directly. One known
 * cosmetic limitation: the shell's nav icon lookup is a hardcoded
 * id-keyed table that falls back to a generic gear icon for unrecognized
 * ids — our section gets a full custom label but the default icon.
 */
export const dataSourcesSettingsSection = {
  name: 'data-sources-settings-section',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'data-sources',
      order: 25,
      label: () => 'Data Sources',
    }, DataSourcesPanel))
  },
}
