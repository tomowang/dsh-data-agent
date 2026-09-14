import * as React from 'react'
import type { SchemaResult, TableInfo } from '../../data-source/types.ts'

const tableCellStyle: React.CSSProperties = {
  border: '1px solid rgba(128, 128, 128, 0.3)',
  padding: '4px 8px',
  textAlign: 'left',
  fontSize: 12,
}

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 4px',
  width: '100%',
  boxSizing: 'border-box',
}

export interface SchemaTreeProps {
  schema: SchemaResult
  /** Given, comments render as click-to-edit inline forms — used by the Settings schema viewer. Omit for read-only (the Chat card). */
  onSaveComment?: (table: string, column: string | undefined, comment: string | null) => Promise<void>
  /**
   * Given, a database-scope table section (no `columns` yet) fetches its
   * column detail lazily on first expand instead of assuming it's already
   * present — used by the Settings schema viewer, whose initial fetch is
   * database-scope (bounded, no per-column detail) by design. Omit for the
   * Chat card, whose `get_schema` result already carries whatever scope the
   * model asked for.
   */
  onExpandTable?: (table: string) => void
  /** Table names currently being fetched for lazy column detail (shows a loading hint instead of an empty body). */
  loadingTables?: ReadonlySet<string>
}

/**
 * Table/column browser shared between the `get_schema` Chat card
 * (`tool/components/GetSchemaRow.tsx`, read-only) and the Settings schema
 * viewer (`settings/DataSourcesPanel.tsx`, editable via `onSaveComment`) —
 * safe to share because both live in the same browser bundle (the
 * bundle-purity gate restricts cross-*plugin* imports, not intra-package
 * reuse).
 */
export function SchemaTree({ schema, onSaveComment, onExpandTable, loadingTables }: SchemaTreeProps): React.ReactElement {
  return (
    <div>
      {schema.tables.map(table => (
        <TableSection
          key={table.name}
          table={table}
          onSaveComment={onSaveComment}
          onExpand={onExpandTable !== undefined ? () => onExpandTable(table.name) : undefined}
          loading={loadingTables?.has(table.name) ?? false}
        />
      ))}
      {schema.truncated && <p style={{ fontSize: 12, opacity: 0.7 }}>(table list truncated)</p>}
    </div>
  )
}

function TableSection(
  { table, onSaveComment, onExpand, loading }: {
    table: TableInfo
    onSaveComment?: SchemaTreeProps['onSaveComment']
    onExpand?: () => void
    loading: boolean
  },
): React.ReactElement {
  return (
    <details
      open={table.columns !== undefined}
      style={{ marginBottom: 8 }}
      onToggle={(event) => {
        if (onExpand !== undefined && table.columns === undefined && (event.target as HTMLDetailsElement).open) onExpand()
      }}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        {table.name}
        <span style={{ fontWeight: 400, opacity: 0.7 }}> ({table.columnCount} columns)</span>
      </summary>
      <EditableComment table={table.name} column={undefined} text={table.comment} onSave={onSaveComment} />
      {table.columns === undefined && loading && <p style={{ fontSize: 12, opacity: 0.7 }}>Loading columns…</p>}
      {table.columns !== undefined && (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
          <thead>
            <tr>
              {['column', 'type', 'nullable', 'pk', 'comment'].map(header => (
                <th key={header} style={{ ...tableCellStyle, fontWeight: 600 }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.columns.map(column => (
              <tr key={column.name}>
                <td style={tableCellStyle}>{column.name}</td>
                <td style={tableCellStyle}>{column.dataType}</td>
                <td style={tableCellStyle}>{column.nullable ? 'yes' : 'no'}</td>
                <td style={tableCellStyle}>{column.isPrimaryKey ? 'yes' : ''}</td>
                <td style={tableCellStyle}>
                  <EditableComment table={table.name} column={column.name} text={column.comment} onSave={onSaveComment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {table.truncated === true && <p style={{ fontSize: 12, opacity: 0.7 }}>(column list truncated)</p>}
    </details>
  )
}

interface EditableCommentProps {
  table: string
  column: string | undefined
  text: string | undefined
  onSave?: (table: string, column: string | undefined, comment: string | null) => Promise<void>
}

/** Read-only text when `onSave` is omitted; otherwise a click-to-edit inline form. */
function EditableComment({ table, column, text, onSave }: EditableCommentProps): React.ReactElement | null {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(text ?? '')
  const [saving, setSaving] = React.useState(false)

  if (onSave === undefined) {
    return text !== undefined ? <span style={{ opacity: 0.8 }}>{text}</span> : null
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(text ?? ''); setEditing(true) }}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
          opacity: text !== undefined ? 0.8 : 0.5,
          fontStyle: text !== undefined ? 'normal' : 'italic',
          textDecoration: 'underline dotted',
        }}
      >
        {text ?? 'add comment'}
      </button>
    )
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(table, column, draft.trim().length === 0 ? null : draft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        style={inputStyle}
        value={draft}
        disabled={saving}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save()
          if (event.key === 'Escape') setEditing(false)
        }}
        autoFocus
      />
      <button type="button" disabled={saving} onClick={() => void save()}>save</button>
      <button type="button" disabled={saving} onClick={() => setEditing(false)}>cancel</button>
    </span>
  )
}
