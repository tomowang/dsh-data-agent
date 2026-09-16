import type { Context } from '@deepseek-ai/cordis'
import { asRecord, requireString } from './tool-types.ts'

const NAME = 'da_remove_data_source'

export function applyRemoveDataSourceTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description: 'Remove a registered data source and its saved comments. Removing an unknown name is not an error.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
    output: {
      schema: {
        type: 'object',
        required: ['name', 'found'],
        properties: { name: { type: 'string' }, found: { type: 'boolean' } },
      },
      render(_args, value) {
        const result = value as { name: string, found: boolean }
        const text = result.found
          ? `Removed data source \`${result.name}\`.`
          : `No data source named \`${result.name}\`.`
        return [{ type: 'text', text }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const name = requireString(args, 'name', NAME)
      return ctx.dataAgent.removeSource(name)
    },
  })
}
