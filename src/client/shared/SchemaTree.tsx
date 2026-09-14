import * as React from 'react'
import type { SchemaResult, TableInfo } from '../../data-source/types.ts'

const tableCellStyle: React.CSSProperties = {
  border: '1px solid rgba(128, 128, 128, 0.3)',
  padding: '4px 8px',
  textAlign: 'left',
  fontSize: 12,
}

export interface SchemaTreeProps {
  schema: SchemaResult
  /** Given, renders as an inline form instead of plain text — used by the Settings schema viewer (see settings/DataSourcesPanel.tsx). */
  onEditComment?: (table: string, column: string | undefined, currentComment: string | undefined) => void
}

/**
 * Table/column browser shared between the `get_schema` Chat card
 * (`tool/components/GetSchemaRow.tsx`) and the Settings schema viewer
 * (`settings/DataSourcesPanel.tsx`) — safe to share because both live in the
 * same browser bundle (the bundle-purity gate restricts cross-*plugin*
 * imports, not intra-package reuse).
 */
export function SchemaTree({ schema, onEditComment }: SchemaTreeProps): React.ReactElement {
  return (
    <div>
      {schema.tables.map(table => (
        <TableSection key={table.name} table={table} onEditComment={onEditComment} />
      ))}
      {schema.truncated && <p style={{ fontSize: 12, opacity: 0.7 }}>(table list truncated)</p>}
    </div>
  )
}

function TableSection({ table, onEditComment }: { table: TableInfo, onEditComment?: SchemaTreeProps['onEditComment'] }): React.ReactElement {
  return (
    <details open={table.columns !== undefined} style={{ marginBottom: 8 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        {table.name}
        <span style={{ fontWeight: 400, opacity: 0.7 }}> ({table.columnCount} columns)</span>
      </summary>
      <CommentLine
        text={table.comment}
        onEdit={onEditComment !== undefined ? () => onEditComment(table.name, undefined, table.comment) : undefined}
      />
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
                  <CommentLine
                    text={column.comment}
                    onEdit={onEditComment !== undefined ? () => onEditComment(table.name, column.name, column.comment) : undefined}
                  />
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

function CommentLine({ text, onEdit }: { text: string | undefined, onEdit?: () => void }): React.ReactElement | null {
  if (onEdit === undefined) return text !== undefined ? <span style={{ opacity: 0.8 }}>{text}</span> : null
  return (
    <button
      type="button"
      onClick={onEdit}
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
