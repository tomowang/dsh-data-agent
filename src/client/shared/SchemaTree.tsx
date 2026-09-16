import * as React from 'react'
import { DisclosureRow, IconCheckOutline16, IconCloseOutline16, IconDatabaseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SchemaResult, TableInfo } from '../../data-source/types.ts'
import { ensureDshStyles } from './dsh-styles.ts'

ensureDshStyles()

export interface SchemaTreeProps {
  schema: SchemaResult
  /** Given, comments render as click-to-edit inline forms — used by the Settings schema viewer. Omit for read-only (the Chat card). */
  onSaveComment?: (table: string, column: string | undefined, comment: string | null) => Promise<void>
  /**
   * Given, a database-scope table section (no `columns` yet) fetches its
   * column detail lazily on first expand instead of assuming it's already
   * present — used by the Settings schema viewer, whose initial fetch is
   * database-scope (bounded, no per-column detail) by design. Omit for the
   * Chat card, whose `da_get_schema` result already carries whatever scope the
   * model asked for.
   */
  onExpandTable?: (table: string) => void
  /** Table names currently being fetched for lazy column detail (shows a loading hint instead of an empty body). */
  loadingTables?: ReadonlySet<string>
}

/**
 * Table/column browser shared between the `da_get_schema` Chat card
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
      {schema.truncated && <p className="dsh-da-truncated">(table list truncated)</p>}
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
  const [open, setOpen] = React.useState(table.columns !== undefined)

  const toggle = (): void => {
    if (!open && table.columns === undefined) onExpand?.()
    setOpen(!open)
  }

  return (
    <DisclosureRow
      icon={<IconDatabaseOutline16 />}
      title={table.name}
      open={open}
      expandable
      expandOnRowClick
      keepContentWhenOpen
      onToggle={toggle}
      collapsedContent={<span className="dsh-da-tableMeta">{` (${table.columnCount} columns)`}</span>}
    >
      <div style={{ paddingLeft: 22 }}>
        <EditableComment table={table.name} column={undefined} text={table.comment} onSave={onSaveComment} />
        {table.columns === undefined && loading && <p className="dsh-da-loading">Loading columns…</p>}
        {table.columns !== undefined && (
          <div className="dsh-da-tableWrap">
            <table className="dsh-da-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Type</th>
                  <th>Nullable</th>
                  <th>PK</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map(column => (
                  <tr key={column.name}>
                    <td>{column.name}</td>
                    <td>{column.dataType}</td>
                    <td>{column.nullable ? 'yes' : 'no'}</td>
                    <td>{column.isPrimaryKey ? 'yes' : ''}</td>
                    <td>
                      <EditableComment table={table.name} column={column.name} text={column.comment} onSave={onSaveComment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {table.truncated === true && <p className="dsh-da-truncated">(column list truncated)</p>}
      </div>
    </DisclosureRow>
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
    return text !== undefined ? <span>{text}</span> : null
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={text !== undefined ? 'dsh-da-commentButton' : 'dsh-da-commentButton dsh-da-commentPlaceholder'}
        onClick={() => { setDraft(text ?? ''); setEditing(true) }}
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
    <span className="dsh-da-commentEditRow">
      <input
        className="dsh-da-input"
        value={draft}
        disabled={saving}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save()
          if (event.key === 'Escape') setEditing(false)
        }}
        autoFocus
      />
      <button type="button" className="dsh-da-iconButton" disabled={saving} aria-label="Save comment" onClick={() => void save()}>
        <IconCheckOutline16 size={14} />
      </button>
      <button type="button" className="dsh-da-iconButton" disabled={saving} aria-label="Cancel" onClick={() => setEditing(false)}>
        <IconCloseOutline16 size={14} />
      </button>
    </span>
  )
}
