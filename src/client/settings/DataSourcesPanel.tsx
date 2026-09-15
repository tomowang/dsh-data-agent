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
import type { ConnectionTestResult, DataSourceRecord, Engine, SchemaResult } from '../../data-source/types.ts'
import { ensureDshStyles } from '../shared/dsh-styles.ts'
import { SchemaTree } from '../shared/SchemaTree.tsx'
import * as api from './api.ts'
import {
  buildAddSourceInput,
  defaultFieldValues,
  ENGINE_FORM_SCHEMAS,
  ENGINE_ORDER,
  type FieldSpec,
  type FieldValues,
  visibleFields,
} from './data-source-form-schema.ts'

ensureDshStyles()

function FormField({ field, value, onChange }: {
  field: FieldSpec
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
}): React.ReactElement {
  if (field.type === 'switch') {
    return (
      <label className="dsh-da-switchRow">
        <Switch checked={value === true} onChange={onChange} label={field.label} />
        <span className="dsh-da-switchLabel">{field.label}</span>
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <label className="dsh-da-field">
        <span className="dsh-da-fieldLabel">{field.label}</span>
        <select className="dsh-da-selectInput" value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    )
  }
  return (
    <label className="dsh-da-field">
      <span className="dsh-da-fieldLabel">{field.label}</span>
      <Input
        placeholder={field.placeholder}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        required={field.required}
      />
    </label>
  )
}

function AddSourceForm({ onAdded }: { onAdded: () => void }): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [engine, setEngine] = React.useState<Engine>('sqlite')
  const [values, setValues] = React.useState<FieldValues>(() => defaultFieldValues('sqlite'))
  const [readOnly, setReadOnly] = React.useState(true)
  const [description, setDescription] = React.useState('')
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

  const changeEngine = (next: Engine): void => {
    setEngine(next)
    setValues(defaultFieldValues(next))
  }

  const setField = (key: string, value: string | boolean): void => setValues(v => ({ ...v, [key]: value }))

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await api.addSource(buildAddSourceInput(engine, name, readOnly, description, values))
      setName('')
      setEngine('sqlite')
      setValues(defaultFieldValues('sqlite'))
      setReadOnly(true)
      setDescription('')
      setOpen(false)
      onAdded()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fields = visibleFields(engine, values)
  const textFields = fields.filter(field => field.type !== 'switch')
  const switchFields = fields.filter(field => field.type === 'switch')

  return (
    <form className="dsh-da-editor" onSubmit={event => void submit(event)}>
      <p className="dsh-da-editorTitle">New data source</p>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">Engine</span>
          <select className="dsh-da-selectInput" value={engine} onChange={e => changeEngine(e.target.value as Engine)}>
            {ENGINE_ORDER.map(value => <option key={value} value={value}>{ENGINE_FORM_SCHEMAS[value].label}</option>)}
          </select>
        </label>
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">Name</span>
          <Input placeholder="e.g. prod-mysql" value={name} onChange={e => setName(e.target.value)} required />
        </label>
        {textFields.map(field => (
          <FormField key={field.key} field={field} value={values[field.key]} onChange={value => setField(field.key, value)} />
        ))}
      </div>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-switchRow">
          <Switch checked={readOnly} onChange={setReadOnly} label="Read-only" />
          <span className="dsh-da-switchLabel">Read-only</span>
        </label>
        {switchFields.map(field => (
          <FormField key={field.key} field={field} value={values[field.key]} onChange={value => setField(field.key, value)} />
        ))}
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
      setTestResult(await api.testConnection(source.name))
    } catch (err) {
      setTestResult({ ok: false, error: { code: 'request_failed', message: (err as Error).message } })
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
      setSchema(await api.getSchema(source.name))
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
      const detail = await api.getSchema(source.name, table)
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
    await api.setComment(source.name, table, column, comment)
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
          <span className="dsh-da-rowName">{source.name}</span>
          <Tag tone="neutral">{source.engine}</Tag>
          {!source.readOnly && <Tag tone="warning">read-write</Tag>}
        </span>
        <span className="dsh-da-rowActions">
          <label className="dsh-da-switchRow">
            <Switch
              checked={source.readOnly}
              onChange={value => void api.setReadOnly(source.name, value).then(onChanged)}
              label={`Read-only for ${source.name}`}
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
          <button type="button" className="dsh-da-dangerButton" onClick={() => void api.removeSource(source.name).then(onChanged)}>
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
            : sources.map(source => <SourceRow key={source.name} source={source} onChanged={refresh} />)}
      </ul>
      <AddSourceForm onAdded={refresh} />
    </div>
  )
}
