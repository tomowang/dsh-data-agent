import type { Context } from '@deepseek-ai/cordis'
import type { Engine } from '../data-source/types.ts'
import { toSafeRecord } from './shared.ts'
import {
  asRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireEnum,
  requireString,
} from './tool-types.ts'

const NAME = 'add_data_source'
const ENGINES: readonly Engine[] = ['mysql', 'postgres', 'sqlite']

export function applyAddDataSourceTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Register a new database connection. For MySQL/PostgreSQL, provide host/port/database/user and, if the '
      + 'database requires a password, `passwordEnv` — the NAME of an environment variable holding it (never the '
      + 'password itself). For SQLite, `database` is the file path and the other connection fields are ignored. '
      + 'The connection is not tested here — use test_connection afterward.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'engine', 'database'],
      properties: {
        id: { type: 'string', description: 'A short unique name for this data source, e.g. "prod-mysql".' },
        engine: { type: 'string', enum: [...ENGINES], description: 'One of: mysql, postgres, sqlite.' },
        host: { type: 'string', description: 'MySQL/PostgreSQL only.' },
        port: { type: 'number', description: 'MySQL/PostgreSQL only.' },
        database: { type: 'string', description: 'MySQL/PostgreSQL: database name. SQLite: file path.' },
        user: { type: 'string', description: 'MySQL/PostgreSQL only.' },
        passwordEnv: { type: 'string', description: 'Name of an environment variable holding the password.' },
        ssl: { type: 'boolean', description: 'MySQL/PostgreSQL only.' },
        readOnly: { type: 'boolean', description: 'Defaults to true. Toggle later with set_read_only.' },
        description: { type: 'string' },
      },
    },
    output: {
      schema: {
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
          readOnly: { type: 'boolean' },
          description: { type: 'string' },
          createdAt: { type: 'string' },
        },
      },
      render(_args, value) {
        const record = value as { id: string, engine: string, readOnly: boolean }
        return [{
          type: 'text',
          text: `Added data source \`${record.id}\` (${record.engine}, ${record.readOnly ? 'read-only' : 'read-write'}).`,
        }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const id = requireString(args, 'id', NAME)
      const engine = requireEnum(args, 'engine', ENGINES, NAME)
      const database = requireString(args, 'database', NAME)

      const record = await ctx.dataAgent.addSource({
        id,
        engine,
        database,
        host: optionalString(args, 'host', NAME),
        port: optionalNumber(args, 'port', NAME),
        user: optionalString(args, 'user', NAME),
        passwordEnv: optionalString(args, 'passwordEnv', NAME),
        ssl: optionalBoolean(args, 'ssl', NAME),
        readOnly: optionalBoolean(args, 'readOnly', NAME) ?? true,
        description: optionalString(args, 'description', NAME),
      })

      return toSafeRecord(record)
    },
  })
}
