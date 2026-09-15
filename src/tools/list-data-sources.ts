import type { Context } from '@deepseek-ai/cordis'
import type { DataSourceRecord } from '../data-source/types.ts'
import { renderMarkdownTable, toSafeRecord } from './shared.ts'

const NAME = 'list_data_sources'

export function applyListDataSourcesTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description: 'List every registered data source (never includes secrets).',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object',
        required: ['sources'],
        properties: {
          sources: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'engine', 'database', 'readOnly', 'createdAt'],
              properties: {
                id: { type: 'string' },
                engine: { type: 'string' },
                host: { type: 'string' },
                port: { type: 'number' },
                database: { type: 'string' },
                user: { type: 'string' },
                passwordEnv: { type: 'string' },
                ssl: { type: 'boolean' },
                sslmode: { type: 'string', enum: ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] },
                sslrootcert: { type: 'string' },
                readOnly: { type: 'boolean' },
                description: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
      render(_args, value) {
        const { sources } = value as { sources: DataSourceRecord[] }
        if (sources.length === 0) return [{ type: 'text', text: 'No data sources registered yet.' }]
        const rows = sources.map(source => ({
          id: source.id,
          engine: source.engine,
          location: source.engine === 'sqlite' ? source.database : `${source.host ?? ''}/${source.database}`,
          readOnly: source.readOnly,
        }))
        const text = renderMarkdownTable(['id', 'engine', 'location', 'readOnly'], rows, {
          limit: rows.length,
          totalRowCount: rows.length,
        })
        return [{ type: 'text', text }]
      },
    },
    async execute() {
      const sources = await ctx.dataAgent.list()
      return { sources: sources.map(toSafeRecord) }
    },
  })
}
