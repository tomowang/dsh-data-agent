/**
 * Gives the `data-sources` settings.section nav row a database glyph
 * instead of the shell's generic gear fallback.
 *
 * `settings.section` registrations only carry `id`, `order`, and `label`;
 * the settings shell picks nav icons from its own closed, hardcoded
 * id-keyed table and falls back to a generic gear for any id it doesn't
 * recognize (see the doc comment in ./index.ts). Until that contract grows
 * an icon field there's no way to carry one through the registration — so,
 * following the same workaround the DSH-better-sidebar plugin uses for its
 * own nav row (github.com/omdsh-dev/DSH-better-sidebar), we find our row by
 * its rendered label text after the Settings dialog mounts, mark it with a
 * data attribute, and let an injected stylesheet mask a custom glyph over
 * the shell's default icon.
 */

export const SETTINGS_NAV_MARKER = 'data-dsh-data-agent-settings-nav'

const STYLE_TAG_ID = 'dsh-data-agent-settings-nav-icon-style'

// lucide "database" glyph (https://lucide.dev), recolored for mask use — the
// color itself is irrelevant once applied as a mask, only the opaque shapes
// matter.
const DATABASE_ICON_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cellipse cx='12' cy='5' rx='9' ry='3'/%3E%3Cpath d='M3 5V19A9 3 0 0 0 21 19V5'/%3E%3Cpath d='M3 12A9 3 0 0 0 21 12'/%3E%3C/svg%3E"

/**
 * Append the glyph-swap stylesheet once per document. Idempotent so
 * repeated calls (HMR reloads, a second plugin instance) never pile up
 * duplicate `<style>` tags.
 */
function ensureIconStyle(): void {
  if (document.getElementById(STYLE_TAG_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_TAG_ID
  style.textContent = `
[${SETTINGS_NAV_MARKER}] > svg:first-child { display: none; }
[${SETTINGS_NAV_MARKER}]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("${DATABASE_ICON_DATA_URI}") center / contain no-repeat;
  mask: url("${DATABASE_ICON_DATA_URI}") center / contain no-repeat;
}`
  document.head.appendChild(style)
}

/**
 * Keep the marker attribute on the settings-nav button whose visible text
 * is this plugin's current section label.
 * @param label - resolves the section's current (locale-aware) label text.
 * @returns disposer that disconnects observation and removes owned markers;
 *   the shared stylesheet itself is left in place (idempotent, harmless to
 *   other instances).
 */
export function registerSettingsNavIcon(label: () => string): () => void {
  ensureIconStyle()
  let disposed = false

  const sync = (): void => {
    if (disposed) return
    const currentLabel = label().trim()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')
    for (const button of buttons) {
      const matches = currentLabel.length > 0 && button.textContent?.trim() === currentLabel
      if (matches) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }

  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })

  return () => {
    disposed = true
    observer.disconnect()
    document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`)
      .forEach(element => { element.removeAttribute(SETTINGS_NAV_MARKER) })
  }
}
