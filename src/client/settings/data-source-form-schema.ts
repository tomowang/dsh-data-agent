import type { DataSourceRecord, Engine } from '../../data-source/types.ts'
import type { AddSourceInput, EditSourceInput } from './api.ts'
import type { DataSourcesSettingsLocaleKey } from './locales.ts'

/**
 * Adapter-style description of one data source type's "add source" form.
 * Adding a new engine means adding one entry here — `AddSourceForm` in
 * `DataSourcesPanel.tsx` renders whatever `fields` it finds, with no
 * per-engine branching of its own.
 */
export type FieldType = 'text' | 'number' | 'select' | 'switch'

export interface SelectOption {
  readonly value: string
  readonly labelKey: DataSourcesSettingsLocaleKey
}

export interface FieldSpec {
  /** Must match the corresponding key on `AddSourceInput`. */
  readonly key: 'database' | 'host' | 'port' | 'user' | 'passwordEnv' | 'ssl' | 'sslmode' | 'sslrootcert'
  readonly labelKey: DataSourcesSettingsLocaleKey
  readonly type: FieldType
  readonly placeholder?: string
  readonly required?: boolean
  /** Rendered as a hover/focus tooltip next to the label. */
  readonly tooltipKey?: DataSourcesSettingsLocaleKey
  /** `select` only. */
  readonly options?: readonly SelectOption[]
  readonly defaultValue?: string | boolean
  /** Field is rendered, and contributes to the submitted payload, only when this returns true. */
  readonly visibleWhen?: (values: FieldValues) => boolean
}

export type FieldValues = Record<string, string | boolean>

export interface EngineFormSchema {
  readonly labelKey: DataSourcesSettingsLocaleKey
  readonly fields: readonly FieldSpec[]
}

const SSL_MODE_OPTIONS: readonly SelectOption[] = [
  { value: 'disable', labelKey: 'sslModeDisable' },
  { value: 'allow', labelKey: 'sslModeAllow' },
  { value: 'prefer', labelKey: 'sslModePrefer' },
  { value: 'require', labelKey: 'sslModeRequire' },
  { value: 'verify-ca', labelKey: 'sslModeVerifyCa' },
  { value: 'verify-full', labelKey: 'sslModeVerifyFull' },
]

/** One schema per `Engine` member — the `Record` keeps this exhaustive as engines are added. */
export const ENGINE_FORM_SCHEMAS: Record<Engine, EngineFormSchema> = {
  mysql: {
    labelKey: 'engineMysql',
    fields: [
      { key: 'host', labelKey: 'fieldHost', type: 'text', placeholder: 'host' },
      { key: 'port', labelKey: 'fieldPort', type: 'number', placeholder: 'port', defaultValue: '3306' },
      { key: 'user', labelKey: 'fieldUser', type: 'text', placeholder: 'user' },
      { key: 'passwordEnv', labelKey: 'fieldPasswordEnv', type: 'text', placeholder: 'e.g. DSH_DA_PROD_DB_PASSWORD', tooltipKey: 'fieldPasswordEnvTooltip' },
      { key: 'database', labelKey: 'fieldDatabase', type: 'text', placeholder: 'database name', required: true },
      { key: 'ssl', labelKey: 'fieldSsl', type: 'switch', defaultValue: false },
    ],
  },
  postgres: {
    labelKey: 'enginePostgres',
    fields: [
      { key: 'host', labelKey: 'fieldHost', type: 'text', placeholder: 'host' },
      { key: 'port', labelKey: 'fieldPort', type: 'number', placeholder: 'port', defaultValue: '5432' },
      { key: 'user', labelKey: 'fieldUser', type: 'text', placeholder: 'user' },
      { key: 'passwordEnv', labelKey: 'fieldPasswordEnv', type: 'text', placeholder: 'e.g. DSH_DA_PROD_DB_PASSWORD', tooltipKey: 'fieldPasswordEnvTooltip' },
      { key: 'database', labelKey: 'fieldDatabase', type: 'text', placeholder: 'database name', required: true },
      { key: 'sslmode', labelKey: 'fieldSslMode', type: 'select', defaultValue: 'disable', options: SSL_MODE_OPTIONS },
      {
        key: 'sslrootcert',
        labelKey: 'fieldCaCertPath',
        type: 'text',
        placeholder: '/path/to/ca.pem',
        visibleWhen: values => values.sslmode === 'verify-ca' || values.sslmode === 'verify-full',
      },
    ],
  },
  sqlite: {
    labelKey: 'engineSqlite',
    fields: [
      { key: 'database', labelKey: 'fieldFilePath', type: 'text', placeholder: '/path/to/file.db', required: true },
    ],
  },
  clickhouse: {
    labelKey: 'engineClickhouse',
    fields: [
      { key: 'host', labelKey: 'fieldHost', type: 'text', placeholder: 'host' },
      { key: 'port', labelKey: 'fieldPort', type: 'number', placeholder: 'port', defaultValue: '8123' },
      { key: 'user', labelKey: 'fieldUser', type: 'text', placeholder: 'user' },
      { key: 'passwordEnv', labelKey: 'fieldPasswordEnv', type: 'text', placeholder: 'e.g. DSH_DA_PROD_DB_PASSWORD', tooltipKey: 'fieldPasswordEnvTooltip' },
      { key: 'database', labelKey: 'fieldDatabase', type: 'text', placeholder: 'database name', required: true },
      { key: 'ssl', labelKey: 'fieldSsl', type: 'switch', defaultValue: false },
    ],
  },
}

/** Dropdown order for the Engine select — the schema record's own key order. */
export const ENGINE_ORDER = Object.keys(ENGINE_FORM_SCHEMAS) as Engine[]

export function defaultFieldValues(engine: Engine): FieldValues {
  const values: FieldValues = {}
  for (const field of ENGINE_FORM_SCHEMAS[engine].fields) {
    values[field.key] = field.defaultValue ?? (field.type === 'switch' ? false : '')
  }
  return values
}

export function visibleFields(engine: Engine, values: FieldValues): readonly FieldSpec[] {
  return ENGINE_FORM_SCHEMAS[engine].fields.filter(field => field.visibleWhen === undefined || field.visibleWhen(values))
}

/** Seeds edit-form state from an existing record — the inverse of `buildEditSourceInput`. */
export function fieldValuesFromRecord(engine: Engine, record: DataSourceRecord): FieldValues {
  const values = defaultFieldValues(engine)
  const source = record as unknown as Record<string, string | number | boolean | undefined>
  for (const field of ENGINE_FORM_SCHEMAS[engine].fields) {
    const raw = source[field.key]
    if (raw === undefined) continue
    values[field.key] = field.type === 'switch' ? Boolean(raw) : String(raw)
  }
  return values
}

/** Assembles the API payload from generic form state — the one place field keys meet `AddSourceInput`. */
export function buildAddSourceInput(
  engine: Engine,
  name: string,
  readOnly: boolean,
  description: string,
  values: FieldValues,
): AddSourceInput {
  const payload: Record<string, string | number | boolean | undefined> = { name, engine, readOnly }
  for (const field of visibleFields(engine, values)) {
    const raw = values[field.key]
    if (field.type === 'switch') {
      payload[field.key] = raw === true
      continue
    }
    if (typeof raw !== 'string' || raw.length === 0) continue
    payload[field.key] = field.type === 'number' ? Number(raw) : raw
  }
  if (description.length > 0) payload.description = description
  return payload as unknown as AddSourceInput
}

/**
 * Assembles an `editSource` patch from generic form state. Unlike
 * `buildAddSourceInput` (which just omits an empty/hidden field, fine for a
 * brand-new record), this always sets every field explicitly — an empty or
 * newly-hidden field is sent as `null` so it actually clears a previously
 * saved value instead of silently leaving it in place.
 */
export function buildEditSourceInput(
  engine: Engine,
  readOnly: boolean,
  description: string,
  values: FieldValues,
): EditSourceInput {
  const payload: Record<string, string | number | boolean | null | undefined> = { readOnly }
  const visible = new Set(visibleFields(engine, values).map(field => field.key))
  for (const field of ENGINE_FORM_SCHEMAS[engine].fields) {
    if (!visible.has(field.key)) {
      if (field.key !== 'database') payload[field.key] = null
      continue
    }
    const raw = values[field.key]
    if (field.type === 'switch') {
      payload[field.key] = raw === true
      continue
    }
    if (typeof raw !== 'string' || raw.length === 0) {
      if (field.key !== 'database') payload[field.key] = null
      continue
    }
    payload[field.key] = field.type === 'number' ? Number(raw) : raw
  }
  payload.description = description.length > 0 ? description : null
  return payload as unknown as EditSourceInput
}
