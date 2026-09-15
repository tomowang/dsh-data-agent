import type { Context } from '@deepseek-ai/cordis'
import { getSourceComments } from '../data-source/persistence/comments-store.ts'
import { mergeSchemaComments } from '../data-source/schema-comments.ts'
import type { SchemaResult } from '../data-source/types.ts'
import { asRecord, optionalString, requireString } from './tool-types.ts'

const NAME = 'get_schema'

export function applyGetSchemaTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Fetch tables (and, given `table`, column detail) for a registered data source, merged with any comments '
      + 'saved via set_comment. Omit `table` for a database-level overview (table names, comments, column counts).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceName'],
      properties: {
        sourceName: { type: 'string' },
        table: { type: 'string', description: 'Given, returns full column detail for this one table.' },
        schemaName: { type: 'string', description: 'PostgreSQL schema or MySQL database namespace override.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        required: ['sourceName', 'engine', 'scope', 'tables', 'truncated'],
        properties: {
          sourceName: { type: 'string' },
          engine: { type: 'string' },
          scope: { type: 'string', enum: ['database', 'table'] },
          truncated: { type: 'boolean' },
          tables: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'columnCount'],
              properties: {
                name: { type: 'string' },
                schemaName: { type: 'string' },
                comment: { type: 'string' },
                nativeComment: { type: 'string' },
                columnCount: { type: 'number' },
                truncated: { type: 'boolean' },
                columns: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'dataType', 'nullable', 'isPrimaryKey'],
                    properties: {
                      name: { type: 'string' },
                      dataType: { type: 'string' },
                      nullable: { type: 'boolean' },
                      isPrimaryKey: { type: 'boolean' },
                      comment: { type: 'string' },
                      nativeComment: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render(_args, value) {
        const schema = value as SchemaResult
        const lines: string[] = [`### ${schema.sourceName} (${schema.engine})`]
        for (const table of schema.tables) {
          const suffix = table.comment !== undefined ? ` — ${table.comment}` : ''
          lines.push(`\n**${table.name}**${suffix} (${table.columnCount} columns)`)
          if (table.columns !== undefined) {
            lines.push('| column | type | nullable | pk | comment |')
            lines.push('| --- | --- | --- | --- | --- |')
            for (const column of table.columns) {
              lines.push(
                `| ${column.name} | ${column.dataType} | ${column.nullable} | ${column.isPrimaryKey} | ${column.comment ?? ''} |`,
              )
            }
          }
        }
        if (schema.truncated) lines.push('\n_(table list truncated)_')
        return [{ type: 'text', text: lines.join('\n') }]
      },
      // Already small and JSON-safe by construction (bounded table/column
      // caps in each adapter), so the canonical value is a direct passthrough.
      presentationMeta(_args, value) {
        return value
      },
    },
    async execute(rawArgs): Promise<SchemaResult> {
      const args = asRecord(rawArgs, NAME)
      const sourceName = requireString(args, 'sourceName', NAME)
      const table = optionalString(args, 'table', NAME)
      const schemaName = optionalString(args, 'schemaName', NAME)

      const adapter = await ctx.dataAgent.getAdapter(sourceName)
      const schema = await adapter.getSchema({ table, schemaName })
      const comments = await getSourceComments(sourceName)
      return mergeSchemaComments(schema, comments)
    },
  })
}
