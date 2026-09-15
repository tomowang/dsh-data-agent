import * as React from 'react'
import {
  IconDatabaseOutline16,
  IconPlusOutline16,
  IconRefreshOutline16,
  IconTrashOutline16,
  Input,
  StateDot,
  Switch,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectionTestResult, DataSourceRecord, SchemaResult } from '../../data-source/types.ts'
import { ensureDshStyles } from '../shared/dsh-styles.ts'
import { SchemaTree } from '../shared/SchemaTree.tsx'
import * as api from './api.ts'

ensureDshStyles()

type Engine = 'mysql' | 'postgres' | 'sqlite'
type SslMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'

const emptyForm = {
  id: '',
  engine: 'sqlite' as Engine,
  host: '',
  port: '',
  database: '',
  user: '',
  passwordEnv: '',
  ssl: false,
  sslmode: 'disable' as SslMode,
  sslrootcert: '',
  readOnly: true,
  description: '',
}

function AddSourceForm({ onAdded }: { onAdded: () => void }): React.ReactElement {
  const [form, setForm] = React.useState(emptyForm)
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [saving, setSaving] = React.useState(false)

  if (!open) {
    return (
      <button type="button" className="dsh-da-addButton" onClick={() => setOpen(true)}>
        <IconPlusOutline16 size={14} />
        Add data source
      </button>
    )
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm(f => ({ ...f, [key]: value }))

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await api.addSource({
        id: form.id,
        engine: form.engine,
        database: form.database,
        host: form.host.length > 0 ? form.host : undefined,
        port: form.port.length > 0 ? Number(form.port) : undefined,
        user: form.user.length > 0 ? form.user : undefined,
        passwordEnv: form.passwordEnv.length > 0 ? form.passwordEnv : undefined,
        ssl: form.engine === 'mysql' ? form.ssl : undefined,
        sslmode: form.engine === 'postgres' ? form.sslmode : undefined,
        sslrootcert: form.engine === 'postgres' && form.sslrootcert.length > 0 ? form.sslrootcert : undefined,
        readOnly: form.readOnly,
        description: form.description.length > 0 ? form.description : undefined,
      })
      setForm(emptyForm)
      setOpen(false)
      onAdded()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const isSqlite = form.engine === 'sqlite'

  return (
    <form className="dsh-da-editor" onSubmit={event => void submit(event)}>
      <p className="dsh-da-editorTitle">New data source</p>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">Id</span>
          <Input placeholder="e.g. prod-mysql" value={form.id} onChange={e => set('id', e.target.value)} required />
        </label>
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">Engine</span>
          <select
            className="dsh-da-selectInput"
            value={form.engine}
            onChange={e => set('engine', e.target.value as Engine)}
          >
            <option value="sqlite">sqlite</option>
            <option value="mysql">mysql</option>
            <option value="postgres">postgres</option>
          </select>
        </label>
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">{isSqlite ? 'File path' : 'Database'}</span>
          <Input
            placeholder={isSqlite ? '/path/to/file.db' : 'database name'}
            value={form.database}
            onChange={e => set('database', e.target.value)}
            required
          />
        </label>
        {!isSqlite && (
          <>
            <label className="dsh-da-field">
              <span className="dsh-da-fieldLabel">Host</span>
              <Input placeholder="host" value={form.host} onChange={e => set('host', e.target.value)} />
            </label>
            <label className="dsh-da-field">
              <span className="dsh-da-fieldLabel">Port</span>
              <Input placeholder="port" value={form.port} onChange={e => set('port', e.target.value)} />
            </label>
            <label className="dsh-da-field">
              <span className="dsh-da-fieldLabel">User</span>
              <Input placeholder="user" value={form.user} onChange={e => set('user', e.target.value)} />
            </label>
            <label className="dsh-da-field">
              <span className="dsh-da-fieldLabel">Password env var</span>
              <Input placeholder="e.g. PROD_DB_PASSWORD" value={form.passwordEnv} onChange={e => set('passwordEnv', e.target.value)} />
            </label>
          </>
        )}
        {form.engine === 'postgres' && (
          <label className="dsh-da-field">
            <span className="dsh-da-fieldLabel">SSL mode</span>
            <select
              className="dsh-da-selectInput"
              value={form.sslmode}
              onChange={e => set('sslmode', e.target.value as SslMode)}
            >
              <option value="disable">disable</option>
              <option value="allow">allow</option>
              <option value="prefer">prefer</option>
              <option value="require">require</option>
              <option value="verify-ca">verify-ca</option>
              <option value="verify-full">verify-full</option>
            </select>
          </label>
        )}
        {form.engine === 'postgres' && (form.sslmode === 'verify-ca' || form.sslmode === 'verify-full') && (
          <label className="dsh-da-field">
            <span className="dsh-da-fieldLabel">CA certificate path</span>
            <Input placeholder="/path/to/ca.pem" value={form.sslrootcert} onChange={e => set('sslrootcert', e.target.value)} />
          </label>
        )}
      </div>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-switchRow">
          <Switch checked={form.readOnly} onChange={value => set('readOnly', value)} label="Read-only" />
          <span className="dsh-da-switchLabel">Read-only</span>
        </label>
        {form.engine === 'mysql' && (
          <label className="dsh-da-switchRow">
            <Switch checked={form.ssl} onChange={value => set('ssl', value)} label="Use SSL" />
            <span className="dsh-da-switchLabel">SSL</span>
          </label>
        )}
      </div>
      {error !== undefined && <p className="dsh-da-error">{error}</p>}
      <div className="dsh-da-editorActions">
        <button type="button" className="dsh-da-secondaryButton" disabled={saving} onClick={() => { setOpen(false); setError(undefined) }}>
          Cancel
        </button>
        <button type="submit" className="dsh-da-primaryButton" disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

function connectionStatusLine(result: ConnectionTestResult): React.ReactElement {
  if (result.ok) {
    return (
      <div className="dsh-da-statusLine dsh-da-statusOk">
        <StateDot state="done" />
        <span>{`Connected in ${result.latencyMs ?? '?'}ms.`}</span>
      </div>
    )
  }
  return (
    <div className="dsh-da-statusLine dsh-da-statusErr">
      <StateDot state="error" />
      <span>{`Failed: ${result.error?.message}`}</span>
    </div>
  )
}

function SourceRow({ source, onChanged }: { source: DataSourceRecord, onChanged: () => void }): React.ReactElement {
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | undefined>(undefined)
  const [testing, setTesting] = React.useState(false)
  const [schema, setSchema] = React.useState<SchemaResult | undefined>(undefined)
  const [schemaOpen, setSchemaOpen] = React.useState(false)
  const [schemaError, setSchemaError] = React.useState<string | undefined>(undefined)
  const [loadingTables, setLoadingTables] = React.useState<Set<string>>(new Set())

  const test = async (): Promise<void> => {
    setTesting(true)
    try {
      setTestResult(await api.testConnection(source.id))
    } finally {
      setTesting(false)
    }
  }

  const toggleSchema = async (): Promise<void> => {
    if (schemaOpen) {
      setSchemaOpen(false)
      return
    }
    setSchemaOpen(true)
    setSchemaError(undefined)
    try {
      setSchema(await api.getSchema(source.id))
    } catch (err) {
      setSchemaError((err as Error).message)
    }
  }

  // Fetches this one table's column detail (database-scope queries never
  // include columns, by design — bounded response regardless of DB size) and
  // merges it into the already-displayed tables, preserving any other
  // table's already-expanded detail rather than discarding it on a full
  // re-fetch.
  const expandTable = async (table: string): Promise<void> => {
    setLoadingTables(prev => new Set(prev).add(table))
    try {
      const detail = await api.getSchema(source.id, table)
      const expandedTable = detail.tables[0]
      if (expandedTable === undefined) return
      setSchema(prev => prev === undefined
        ? prev
        : { ...prev, tables: prev.tables.map(t => (t.name === table ? expandedTable : t)) })
    } finally {
      setLoadingTables((prev) => {
        const next = new Set(prev)
        next.delete(table)
        return next
      })
    }
  }

  // Optimistic local patch rather than a full re-fetch, so an already
  // lazily-expanded table's column detail isn't discarded by reverting to a
  // fresh database-scope result.
  const saveComment = async (table: string, column: string | undefined, comment: string | null): Promise<void> => {
    await api.setComment(source.id, table, column, comment)
    setSchema((prev) => {
      if (prev === undefined) return prev
      return {
        ...prev,
        tables: prev.tables.map((t) => {
          if (t.name !== table) return t
          if (column === undefined) return { ...t, comment: comment ?? undefined }
          return { ...t, columns: t.columns?.map(c => (c.name === column ? { ...c, comment: comment ?? undefined } : c)) }
        }),
      }
    })
  }

  const location = source.engine === 'sqlite' ? source.database : `${source.host ?? ''}${source.port !== undefined ? `:${source.port}` : ''}/${source.database}`

  return (
    <li className="dsh-da-rowCard">
      <div className="dsh-da-rowHead">
        <span className="dsh-da-rowIdentity">
          <span className="dsh-da-rowName">{source.id}</span>
          <Tag tone="neutral">{source.engine}</Tag>
          {!source.readOnly && <Tag tone="warning">read-write</Tag>}
        </span>
        <span className="dsh-da-rowActions">
          <label className="dsh-da-switchRow">
            <Switch
              checked={source.readOnly}
              onChange={value => void api.setReadOnly(source.id, value).then(onChanged)}
              label={`Read-only for ${source.id}`}
              title="Read-only"
            />
            <span className="dsh-da-switchLabel">Read-only</span>
          </label>
          <button type="button" className="dsh-da-secondaryButton" disabled={testing} onClick={() => void test()}>
            <IconRefreshOutline16 size={14} />
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button type="button" className="dsh-da-secondaryButton" onClick={() => void toggleSchema()}>
            <IconDatabaseOutline16 size={14} />
            {schemaOpen ? 'Hide schema' : 'View schema'}
          </button>
          <button type="button" className="dsh-da-dangerButton" onClick={() => void api.removeSource(source.id).then(onChanged)}>
            <IconTrashOutline16 size={14} />
            Remove
          </button>
        </span>
      </div>
      <div className="dsh-da-rowMeta">{location}</div>
      {testResult !== undefined && connectionStatusLine(testResult)}
      {schemaOpen && (
        <div className="dsh-da-schemaSection">
          {schemaError !== undefined && <p className="dsh-da-error">{schemaError}</p>}
          {schema !== undefined && (
            <SchemaTree
              schema={schema}
              onSaveComment={saveComment}
              onExpandTable={table => void expandTable(table)}
              loadingTables={loadingTables}
            />
          )}
        </div>
      )}
    </li>
  )
}

/** Content panel for the `data-sources` settings.section entry (settings/index.ts). */
export function DataSourcesPanel(): React.ReactElement {
  const [sources, setSources] = React.useState<DataSourceRecord[] | undefined>(undefined)
  const [error, setError] = React.useState<string | undefined>(undefined)

  const refresh = React.useCallback(() => {
    api.listSources().then(
      result => { setSources(result.sources); setError(undefined) },
      err => { setError((err as Error).message) },
    )
  }, [])

  React.useEffect(() => { refresh() }, [refresh])

  return (
    <div className="dsh-da-section">
      <h2 className="dsh-da-title">Data Sources</h2>
      <p className="dsh-da-intro">Register MySQL, PostgreSQL, or SQLite connections for chat tools to query.</p>
      {error !== undefined && <p className="dsh-da-error">{error}</p>}
      <ul className="dsh-da-rows">
        {sources === undefined
          ? <p className="dsh-da-loading">Loading…</p>
          : sources.length === 0
            ? <p className="dsh-da-empty">No data sources registered yet.</p>
            : sources.map(source => <SourceRow key={source.id} source={source} onChanged={refresh} />)}
      </ul>
      <AddSourceForm onAdded={refresh} />
    </div>
  )
}
