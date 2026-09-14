import * as React from 'react'
import { SchemaTree } from '../../shared/SchemaTree.tsx'
import { getSchemaCardModel } from '../models/get-schema-card-model.ts'
import { fallbackText, type ToolRowProps } from '../tool-view-types.ts'

/**
 * `get_schema` Chat card. Claiming this key suppresses the generic fallback
 * for every `get_schema` result, so this component must cover every shape:
 * running, error, and malformed/legacy `meta` all render as plain text.
 */
export function GetSchemaRow({ block }: ToolRowProps): React.ReactElement {
  const schema = getSchemaCardModel(block)
  if (schema === null) {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{fallbackText(block)}</div>
  }
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{schema.sourceId} ({schema.engine})</div>
      <SchemaTree schema={schema} />
    </div>
  )
}
