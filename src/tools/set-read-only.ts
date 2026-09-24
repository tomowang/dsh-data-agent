import type { Context } from '@deepseek-ai/cordis'
import { assertChatReadOnlyChange } from './shared.ts'
import { asRecord, requireString } from './tool-types.ts'

const NAME = 'da_set_read_only'

export function applySetReadOnlyTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Make a data source read-only without removing and re-adding it. Any already-open connection to this source '
      + 'is closed so the next query reopens under the new mode. Read-only can only be turned off by the user, in '
      + 'Settings → Data Sources — `readOnly: false` is rejected here unless the source is already read-write.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'readOnly'],
      properties: { name: { type: 'string' }, readOnly: { type: 'boolean' } },
    },
    output: {
      schema: {
        type: 'object',
        required: ['name', 'readOnly'],
        properties: { name: { type: 'string' }, readOnly: { type: 'boolean' } },
      },
      render(_args, value) {
        const result = value as { name: string, readOnly: boolean }
        return [{ type: 'text', text: `\`${result.name}\` is now ${result.readOnly ? 'read-only' : 'read-write'}.` }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const name = requireString(args, 'name', NAME)
      const readOnly = args.readOnly
      if (typeof readOnly !== 'boolean') throw new Error(`${NAME}: "readOnly" is required and must be a boolean`)
      assertChatReadOnlyChange(readOnly, (await ctx.dataAgent.get(name))?.readOnly, NAME)
      const record = await ctx.dataAgent.setReadOnly(name, readOnly)
      return { name: record.name, readOnly: record.readOnly }
    },
  })
}
