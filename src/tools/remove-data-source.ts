import type { Context } from '@deepseek-ai/cordis'
import { asRecord, requireString } from './tool-types.ts'

const NAME = 'remove_data_source'

export function applyRemoveDataSourceTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description: 'Remove a registered data source and its saved comments. Removing an unknown id is not an error.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    output: {
      schema: {
        type: 'object',
        required: ['id', 'found'],
        properties: { id: { type: 'string' }, found: { type: 'boolean' } },
      },
      render(_args, value) {
        const result = value as { id: string, found: boolean }
        const text = result.found
          ? `Removed data source \`${result.id}\`.`
          : `No data source named \`${result.id}\`.`
        return [{ type: 'text', text }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const id = requireString(args, 'id', NAME)
      return ctx.dataAgent.removeSource(id)
    },
  })
}
