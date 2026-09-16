import * as React from 'react'
import {
  IconDatabaseOutline16,
  IconEditOutline16,
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
  buildEditSourceInput,
  defaultFieldValues,
  ENGINE_FORM_SCHEMAS,
  ENGINE_ORDER,
  fieldValuesFromRecord,
  type FieldSpec,
  type FieldValues,
  visibleFields,
} from './data-source-form-schema.ts'
import type { DataSourcesSettingsLocaleKey } from './locales.ts'

ensureDshStyles()

/** Translate a dictionary key of this section's own namespace (framework-injected standard seat). */
type T = (key: DataSourcesSettingsLocaleKey, params?: Record<string, unknown>) => string

function FormField({ field, value, onChange, t }: {
  field: FieldSpec
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
  t: T
}): React.ReactElement {
  if (field.type === 'switch') {
    return (
      <label className="dsh-da-switchRow">
        <Switch checked={value === true} onChange={onChange} label={t(field.labelKey)} />
        <span className="dsh-da-switchLabel">{t(field.labelKey)}</span>
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <label className="dsh-da-field">
        <span className="dsh-da-fieldLabel">{t(field.labelKey)}</span>
        <select className="dsh-da-selectInput" value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          {field.options?.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
        </select>
      </label>
    )
  }
  return (
    <label className="dsh-da-field">
      <span className="dsh-da-fieldLabel">{t(field.labelKey)}</span>
      <Input
        placeholder={field.placeholder}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        required={field.required}
      />
    </label>
  )
}

function AddSourceForm({ onAdded, t }: { onAdded: () => void, t: T }): React.ReactElement {
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
        {t('addDataSource')}
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
      <p className="dsh-da-editorTitle">{t('newDataSource')}</p>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">{t('fieldEngine')}</span>
          <select className="dsh-da-selectInput" value={engine} onChange={e => changeEngine(e.target.value as Engine)}>
            {ENGINE_ORDER.map(value => <option key={value} value={value}>{t(ENGINE_FORM_SCHEMAS[value].labelKey)}</option>)}
          </select>
        </label>
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">{t('fieldName')}</span>
          <Input placeholder="e.g. prod-mysql" value={name} onChange={e => setName(e.target.value)} required />
        </label>
        {textFields.map(field => (
          <FormField key={field.key} field={field} value={values[field.key]} onChange={value => setField(field.key, value)} t={t} />
        ))}
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">{t('fieldDescription')}</span>
          <Input placeholder={t('optional')} value={description} onChange={e => setDescription(e.target.value)} />
        </label>
      </div>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-switchRow">
          <Switch checked={readOnly} onChange={setReadOnly} label={t('readOnly')} />
          <span className="dsh-da-switchLabel">{t('readOnly')}</span>
        </label>
        {switchFields.map(field => (
          <FormField key={field.key} field={field} value={values[field.key]} onChange={value => setField(field.key, value)} t={t} />
        ))}
      </div>
      {error !== undefined && <p className="dsh-da-error">{error}</p>}
      <div className="dsh-da-editorActions">
        <button type="button" className="dsh-da-secondaryButton" disabled={saving} onClick={() => { setOpen(false); setError(undefined) }}>
          {t('cancel')}
        </button>
        <button type="submit" className="dsh-da-primaryButton" disabled={saving}>
          {saving ? t('adding') : t('add')}
        </button>
      </div>
    </form>
  )
}

function EditSourceForm({ source, onSaved, onCancel, t }: {
  source: DataSourceRecord
  onSaved: () => void
  onCancel: () => void
  t: T
}): React.ReactElement {
  const [values, setValues] = React.useState<FieldValues>(() => fieldValuesFromRecord(source.engine, source))
  const [readOnly, setReadOnly] = React.useState(source.readOnly)
  const [description, setDescription] = React.useState(source.description ?? '')
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [saving, setSaving] = React.useState(false)

  const setField = (key: string, value: string | boolean): void => setValues(v => ({ ...v, [key]: value }))

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await api.editSource(source.name, buildEditSourceInput(source.engine, readOnly, description, values))
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fields = visibleFields(source.engine, values)
  const textFields = fields.filter(field => field.type !== 'switch')
  const switchFields = fields.filter(field => field.type === 'switch')

  return (
    <form className="dsh-da-editor" onSubmit={event => void submit(event)}>
      <p className="dsh-da-editorTitle">{t('editSourceTitle', { name: source.name })}</p>
      <div className="dsh-da-fieldGrid">
        {textFields.map(field => (
          <FormField key={field.key} field={field} value={values[field.key]} onChange={value => setField(field.key, value)} t={t} />
        ))}
        <label className="dsh-da-field">
          <span className="dsh-da-fieldLabel">{t('fieldDescription')}</span>
          <Input placeholder={t('optional')} value={description} onChange={e => setDescription(e.target.value)} />
        </label>
      </div>
      <div className="dsh-da-fieldGrid">
        <label className="dsh-da-switchRow">
          <Switch checked={readOnly} onChange={setReadOnly} label={t('readOnly')} />
          <span className="dsh-da-switchLabel">{t('readOnly')}</span>
        </label>
        {switchFields.map(field => (
          <FormField key={field.key} field={field} value={values[field.key]} onChange={value => setField(field.key, value)} t={t} />
        ))}
      </div>
      {error !== undefined && <p className="dsh-da-error">{error}</p>}
      <div className="dsh-da-editorActions">
        <button type="button" className="dsh-da-secondaryButton" disabled={saving} onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="submit" className="dsh-da-primaryButton" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}

function connectionStatusLine(result: ConnectionTestResult, t: T): React.ReactElement {
  if (result.ok) {
    return (
      <div className="dsh-da-statusLine dsh-da-statusOk">
        <StateDot state="done" />
        <span>{t('connectedIn', { ms: result.latencyMs ?? '?' })}</span>
      </div>
    )
  }
  return (
    <div className="dsh-da-statusLine dsh-da-statusErr">
      <StateDot state="error" />
      <span>{t('failed', { message: result.error?.message })}</span>
    </div>
  )
}

function SourceRow({ source, onChanged, t }: { source: DataSourceRecord, onChanged: () => void, t: T }): React.ReactElement {
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | undefined>(undefined)
  const [testing, setTesting] = React.useState(false)
  const [schema, setSchema] = React.useState<SchemaResult | undefined>(undefined)
  const [schemaOpen, setSchemaOpen] = React.useState(false)
  const [schemaError, setSchemaError] = React.useState<string | undefined>(undefined)
  const [loadingTables, setLoadingTables] = React.useState<Set<string>>(new Set())
  const [editing, setEditing] = React.useState(false)

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
          {!source.readOnly && <Tag tone="warning">{t('readWrite')}</Tag>}
        </span>
        <span className="dsh-da-rowActions">
          <button type="button" className="dsh-da-secondaryButton" onClick={() => setEditing(true)}>
            <IconEditOutline16 size={14} />
            {t('edit')}
          </button>
          <button type="button" className="dsh-da-dangerButton" onClick={() => void api.removeSource(source.name).then(onChanged)}>
            <IconTrashOutline16 size={14} />
            {t('remove')}
          </button>
        </span>
      </div>
      {editing
        ? (
          <EditSourceForm
            source={source}
            onSaved={() => { setEditing(false); onChanged() }}
            onCancel={() => setEditing(false)}
            t={t}
          />
        )
        : (
          <>
            <div className="dsh-da-rowMeta">{location}</div>
            <div className="dsh-da-rowToolbar">
              <label className="dsh-da-switchRow">
                <Switch
                  checked={source.readOnly}
                  onChange={value => void api.setReadOnly(source.name, value).then(onChanged)}
                  label={t('readOnlyFor', { name: source.name })}
                  title={t('readOnly')}
                />
                <span className="dsh-da-switchLabel">{t('readOnly')}</span>
              </label>
              <span className="dsh-da-rowActions">
                <button type="button" className="dsh-da-secondaryButton" disabled={testing} onClick={() => void test()}>
                  <IconRefreshOutline16 size={14} />
                  {testing ? t('testing') : t('test')}
                </button>
                <button type="button" className="dsh-da-secondaryButton" onClick={() => void toggleSchema()}>
                  <IconDatabaseOutline16 size={14} />
                  {schemaOpen ? t('hideSchema') : t('viewSchema')}
                </button>
              </span>
            </div>
            {testResult !== undefined && connectionStatusLine(testResult, t)}
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
          </>
        )}
    </li>
  )
}

/**
 * Content panel for the `data-sources` settings.section entry (settings/index.ts).
 * `t` is the framework-injected standard seat: the section registration
 * declares `locale: NS`, so the renderer binds it to this namespace's
 * dictionary and re-invokes on locale change.
 */
export function DataSourcesPanel({ t }: { t: T }): React.ReactElement {
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
      <h2 className="dsh-da-title">{t('title')}</h2>
      <h3 className="dsh-da-subtitle">{t('dataSourcesSectionTitle')}</h3>
      <p className="dsh-da-intro">{t('intro')}</p>
      {error !== undefined && <p className="dsh-da-error">{error}</p>}
      <ul className="dsh-da-rows">
        {sources === undefined
          ? <p className="dsh-da-loading">{t('loading')}</p>
          : sources.length === 0
            ? <p className="dsh-da-empty">{t('empty')}</p>
            : sources.map(source => <SourceRow key={source.name} source={source} onChanged={refresh} t={t} />)}
      </ul>
      <AddSourceForm onAdded={refresh} t={t} />
    </div>
  )
}
