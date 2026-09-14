import * as React from 'react'
import type { ConnectionTestResult, DataSourceRecord, SchemaResult } from '../../data-source/types.ts'
import { SchemaTree } from '../shared/SchemaTree.tsx'
import * as api from './api.ts'

const fieldStyle: React.CSSProperties = { fontSize: 12, padding: '4px 6px', marginRight: 6, marginBottom: 6 }
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid rgba(128, 128, 128, 0.2)',
  fontSize: 13,
}

type Engine = 'mysql' | 'postgres' | 'sqlite'

const emptyForm = {
  id: '',
  engine: 'sqlite' as Engine,
  host: '',
  port: '',
  database: '',
  user: '',
  passwordEnv: '',
  ssl: false,
  readOnly: true,
  description: '',
}

function AddSourceForm({ onAdded }: { onAdded: () => void }): React.ReactElement {
  const [form, setForm] = React.useState(emptyForm)
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [saving, setSaving] = React.useState(false)

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)}>+ Add data source</button>
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
        ssl: form.ssl,
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
    <form onSubmit={event => void submit(event)} style={{ border: '1px solid rgba(128,128,128,0.3)', padding: 10, marginBottom: 10 }}>
      <div>
        <input style={fieldStyle} placeholder="id (e.g. prod-mysql)" value={form.id} onChange={e => set('id', e.target.value)} required />
        <select style={fieldStyle} value={form.engine} onChange={e => set('engine', e.target.value as Engine)}>
          <option value="sqlite">sqlite</option>
          <option value="mysql">mysql</option>
          <option value="postgres">postgres</option>
        </select>
      </div>
      <div>
        <input
          style={fieldStyle}
          placeholder={isSqlite ? 'file path' : 'database'}
          value={form.database}
          onChange={e => set('database', e.target.value)}
          required
        />
        {!isSqlite && (
          <>
            <input style={fieldStyle} placeholder="host" value={form.host} onChange={e => set('host', e.target.value)} />
            <input style={fieldStyle} placeholder="port" value={form.port} onChange={e => set('port', e.target.value)} />
            <input style={fieldStyle} placeholder="user" value={form.user} onChange={e => set('user', e.target.value)} />
            <input
              style={fieldStyle}
              placeholder="passwordEnv (env var name)"
              value={form.passwordEnv}
              onChange={e => set('passwordEnv', e.target.value)}
            />
          </>
        )}
      </div>
      <label style={{ fontSize: 12, marginRight: 12 }}>
        <input type="checkbox" checked={form.readOnly} onChange={e => set('readOnly', e.target.checked)} /> read-only
      </label>
      {!isSqlite && (
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={form.ssl} onChange={e => set('ssl', e.target.checked)} /> ssl
        </label>
      )}
      <div style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
        <button type="button" onClick={() => setOpen(false)} style={{ marginLeft: 6 }}>Cancel</button>
      </div>
      {error !== undefined && <p style={{ color: '#c2554a', fontSize: 12 }}>{error}</p>}
    </form>
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
    <div>
      <div style={rowStyle}>
        <strong>{source.id}</strong>
        <span style={{ opacity: 0.7 }}>{source.engine}</span>
        <span style={{ opacity: 0.7, flex: 1 }}>{location}</span>
        <label>
          <input
            type="checkbox"
            checked={source.readOnly}
            onChange={e => void api.setReadOnly(source.id, e.target.checked).then(onChanged)}
          /> read-only
        </label>
        <button type="button" disabled={testing} onClick={() => void test()}>
          {testing ? 'Testing…' : 'Test'}
        </button>
        <button type="button" onClick={() => void toggleSchema()}>{schemaOpen ? 'Hide schema' : 'View schema'}</button>
        <button type="button" onClick={() => void api.removeSource(source.id).then(onChanged)}>Remove</button>
      </div>
      {testResult !== undefined && (
        <div style={{ fontSize: 12, color: testResult.ok ? '#63a375' : '#c2554a' }}>
          {testResult.ok ? `Connected in ${testResult.latencyMs ?? '?'}ms.` : `Failed: ${testResult.error?.message}`}
        </div>
      )}
      {schemaOpen && (
        <div style={{ padding: '8px 0 8px 16px' }}>
          {schemaError !== undefined && <p style={{ color: '#c2554a', fontSize: 12 }}>{schemaError}</p>}
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
    </div>
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
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Data Sources</h2>
      <AddSourceForm onAdded={refresh} />
      {error !== undefined && <p style={{ color: '#c2554a', fontSize: 12 }}>{error}</p>}
      {sources === undefined
        ? <p style={{ fontSize: 12, opacity: 0.7 }}>Loading…</p>
        : sources.length === 0
          ? <p style={{ fontSize: 12, opacity: 0.7 }}>No data sources registered yet.</p>
          : sources.map(source => <SourceRow key={source.id} source={source} onChanged={refresh} />)}
    </div>
  )
}
