import type { Context } from '@deepseek-ai/cordis'
import { setComment } from '../data-source/persistence/comments-store.ts'
import { asRecord, optionalString, requireString } from './tool-types.ts'

const NAME = 'set_comment'

export function applySetCommentTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Add, change, or clear a comment on a table or column, shown thereafter in get_schema. Omit `column` for a '
      + 'table-level comment. Pass an empty `comment` to clear it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceName', 'table', 'comment'],
      properties: {
        sourceName: { type: 'string' },
        table: { type: 'string' },
        column: { type: 'string', description: 'Omit for a table-level comment.' },
        comment: { type: 'string', description: 'Pass an empty string to clear the comment.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        required: ['sourceName', 'table', 'comment'],
        properties: {
          sourceName: { type: 'string' },
          table: { type: 'string' },
          column: { type: 'string' },
          comment: { type: 'string' },
        },
      },
      render(_args, value) {
        const result = value as { sourceName: string, table: string, column?: string, comment: string | null }
        const target = result.column !== undefined ? `${result.table}.${result.column}` : result.table
        const text = result.comment === null
          ? `Cleared comment on \`${result.sourceName}\`.\`${target}\`.`
          : `Set comment on \`${result.sourceName}\`.\`${target}\` to: "${result.comment}"`
        return [{ type: 'text', text }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const sourceName = requireString(args, 'sourceName', NAME)
      const table = requireString(args, 'table', NAME)
      const column = optionalString(args, 'column', NAME)
      const rawComment = args.comment
      if (typeof rawComment !== 'string') throw new Error(`${NAME}: "comment" is required and must be a string`)
      const comment = rawComment.length === 0 ? null : rawComment

      // Confirm the source is registered before persisting a comment for it.
      const record = await ctx.dataAgent.get(sourceName)
      if (record === undefined) throw new Error(`${NAME}: no data source named "${sourceName}"`)

      await setComment(sourceName, table, column, comment)
      return { sourceName, table, column, comment }
    },
  })
}
