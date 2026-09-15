import type { Engine } from '../../data-source/types.ts'
import type { AddSourceInput } from './api.ts'

/**
 * Adapter-style description of one data source type's "add source" form.
 * Adding a new engine means adding one entry here — `AddSourceForm` in
 * `DataSourcesPanel.tsx` renders whatever `fields` it finds, with no
 * per-engine branching of its own.
 */
export type FieldType = 'text' | 'number' | 'select' | 'switch'

export interface SelectOption {
  readonly value: string
  readonly label: string
}

export interface FieldSpec {
  /** Must match the corresponding key on `AddSourceInput`. */
  readonly key: 'database' | 'host' | 'port' | 'user' | 'passwordEnv' | 'ssl' | 'sslmode' | 'sslrootcert'
  readonly label: string
  readonly type: FieldType
  readonly placeholder?: string
  readonly required?: boolean
  /** `select` only. */
  readonly options?: readonly SelectOption[]
  readonly defaultValue?: string | boolean
  /** Field is rendered, and contributes to the submitted payload, only when this returns true. */
  readonly visibleWhen?: (values: FieldValues) => boolean
}

export type FieldValues = Record<string, string | boolean>

export interface EngineFormSchema {
  readonly label: string
  readonly fields: readonly FieldSpec[]
}

const SSL_MODE_OPTIONS: readonly SelectOption[] = [
  { value: 'disable', label: 'disable' },
  { value: 'allow', label: 'allow' },
  { value: 'prefer', label: 'prefer' },
  { value: 'require', label: 'require' },
  { value: 'verify-ca', label: 'verify-ca' },
  { value: 'verify-full', label: 'verify-full' },
]

/** One schema per `Engine` member — the `Record` keeps this exhaustive as engines are added. */
export const ENGINE_FORM_SCHEMAS: Record<Engine, EngineFormSchema> = {
  sqlite: {
    label: 'sqlite',
    fields: [
      { key: 'database', label: 'File path', type: 'text', placeholder: '/path/to/file.db', required: true },
    ],
  },
  mysql: {
    label: 'mysql',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'host' },
      { key: 'port', label: 'Port', type: 'number', placeholder: 'port', defaultValue: '3306' },
      { key: 'user', label: 'User', type: 'text', placeholder: 'user' },
      { key: 'passwordEnv', label: 'Password env var', type: 'text', placeholder: 'e.g. PROD_DB_PASSWORD' },
      { key: 'database', label: 'Database', type: 'text', placeholder: 'database name', required: true },
      { key: 'ssl', label: 'SSL', type: 'switch', defaultValue: false },
    ],
  },
  postgres: {
    label: 'postgres',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'host' },
      { key: 'port', label: 'Port', type: 'number', placeholder: 'port', defaultValue: '5432' },
      { key: 'user', label: 'User', type: 'text', placeholder: 'user' },
      { key: 'passwordEnv', label: 'Password env var', type: 'text', placeholder: 'e.g. PROD_DB_PASSWORD' },
      { key: 'database', label: 'Database', type: 'text', placeholder: 'database name', required: true },
      { key: 'sslmode', label: 'SSL mode', type: 'select', defaultValue: 'disable', options: SSL_MODE_OPTIONS },
      {
        key: 'sslrootcert',
        label: 'CA certificate path',
        type: 'text',
        placeholder: '/path/to/ca.pem',
        visibleWhen: values => values.sslmode === 'verify-ca' || values.sslmode === 'verify-full',
      },
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
