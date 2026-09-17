import * as React from 'react'
import * as api from './api.ts'
import type { DataSourcesSettingsLocaleKey } from './locales.ts'

/** Translate a dictionary key of this section's own namespace (framework-injected standard seat). */
type T = (key: DataSourcesSettingsLocaleKey, params?: Record<string, unknown>) => string

/** "Tools" tab content: the `da_*` chat tools this plugin registers, read live from `ctx.tools` (settings-api's `list-tools` route) so the copy can never drift from what the model actually sees. */
export function ToolsPanel({ t }: { t: T }): React.ReactElement {
  const [tools, setTools] = React.useState<api.ToolSummary[] | undefined>(undefined)
  const [error, setError] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    api.listTools().then(
      result => { setTools(result.tools); setError(undefined) },
      err => { setError((err as Error).message) },
    )
  }, [])

  return (
    <>
      <p className="dsh-da-intro">{t('toolsIntro')}</p>
      {error !== undefined && <p className="dsh-da-error">{error}</p>}
      {tools === undefined
        ? <p className="dsh-da-loading">{t('loading')}</p>
        : tools.length === 0
          ? <p className="dsh-da-empty">{t('toolsEmpty')}</p>
          : (
            <ul className="dsh-da-rows">
              {tools.map(tool => (
                <li key={tool.name} className="dsh-da-toolRow">
                  <span className="dsh-da-toolName">{tool.name}</span>
                  <p className="dsh-da-toolDescription">{tool.description}</p>
                </li>
              ))}
            </ul>
          )}
    </>
  )
}
