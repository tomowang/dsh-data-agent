import * as React from 'react'
import Github from '@thesvg/react/github'
import { ensureDshStyles } from '../shared/dsh-styles.ts'
import { DataSourcesPanel } from './DataSourcesPanel.tsx'
import type { DataSourcesSettingsLocaleKey } from './locales.ts'
import { ToolsPanel } from './ToolsPanel.tsx'

ensureDshStyles()

/** Translate a dictionary key of this section's own namespace (framework-injected standard seat). */
type T = (key: DataSourcesSettingsLocaleKey, params?: Record<string, unknown>) => string

type SectionTab = 'data-sources' | 'tools'

/**
 * Outer content panel for the `data-sources` settings.section entry
 * (settings/index.ts): title bar plus a tab strip switching between
 * `DataSourcesPanel` and `ToolsPanel`. `t` is the framework-injected standard
 * seat: the section registration declares `locale: NS`, so the renderer
 * binds it to this namespace's dictionary and re-invokes on locale change.
 */
export function DataAgentPanel({ t }: { t: T }): React.ReactElement {
  const [tab, setTab] = React.useState<SectionTab>('data-sources')

  return (
    <div className="dsh-da-section">
      <div className="dsh-da-titleBar">
        <h2 className="dsh-da-title">{t('title')}</h2>
        <span className="dsh-da-titleMeta">
          <a
            className="dsh-da-githubLink"
            href={__DSH_DATA_AGENT_REPO_URL__}
            target="_blank"
            rel="noreferrer"
            title={t('viewOnGithub')}
            aria-label={t('viewOnGithub')}
          >
            <Github variant="mono" width={16} height={16} />
          </a>
          <a
            className="dsh-da-versionLabel"
            href={`${__DSH_DATA_AGENT_REPO_URL__}/releases/tag/v${__DSH_DATA_AGENT_VERSION__}`}
            target="_blank"
            rel="noreferrer"
          >
            v{__DSH_DATA_AGENT_VERSION__}
          </a>
        </span>
      </div>
      <p className="dsh-da-intro">{t('pluginDescription')}</p>
      <div className="dsh-da-tabs" role="tablist" aria-label={t('title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'data-sources'}
          className="dsh-da-tab"
          data-active={tab === 'data-sources' ? 'true' : undefined}
          onClick={() => setTab('data-sources')}
        >
          {t('tabDataSources')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tools'}
          className="dsh-da-tab"
          data-active={tab === 'tools' ? 'true' : undefined}
          onClick={() => setTab('tools')}
        >
          {t('tabTools')}
        </button>
      </div>
      {tab === 'data-sources' ? <DataSourcesPanel t={t} /> : <ToolsPanel t={t} />}
    </div>
  )
}
