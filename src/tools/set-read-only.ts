import type { Context } from '@deepseek-ai/cordis'
import { asRecord, requireString } from './tool-types.ts'

const NAME = 'set_read_only'

export function applySetReadOnlyTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Toggle a data source\'s read-only flag without removing and re-adding it. Any already-open connection to '
      + 'this source is closed so the next query reopens under the new mode.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'readOnly'],
      properties: { id: { type: 'string' }, readOnly: { type: 'boolean' } },
    },
    output: {
      schema: {
        type: 'object',
        required: ['id', 'readOnly'],
        properties: { id: { type: 'string' }, readOnly: { type: 'boolean' } },
      },
      render(_args, value) {
        const result = value as { id: string, readOnly: boolean }
        return [{ type: 'text', text: `\`${result.id}\` is now ${result.readOnly ? 'read-only' : 'read-write'}.` }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const id = requireString(args, 'id', NAME)
      const readOnly = args.readOnly
      if (typeof readOnly !== 'boolean') throw new Error(`${NAME}: "readOnly" is required and must be a boolean`)
      const record = await ctx.dataAgent.setReadOnly(id, readOnly)
      return { id: record.id, readOnly: record.readOnly }
    },
  })
}
