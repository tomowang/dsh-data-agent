import type { Context } from '@deepseek-ai/cordis'
import { toSafeRecord } from './shared.ts'
import {
  asRecord,
  optionalBoolean,
  optionalNullableBoolean,
  optionalNullableEnum,
  optionalNullableNumber,
  optionalNullableString,
  optionalString,
  requireString,
} from './tool-types.ts'

const NAME = 'da_edit_data_source'
const SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const

export function applyEditDataSourceTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Update an existing data source\'s connection details, read-only flag, or description, without removing and '
      + 're-adding it (which would also drop its saved schema comments). `name` and `engine` cannot be changed here — '
      + 'use da_remove_data_source then da_add_data_source to switch engine. Every other field is optional: omit a field to '
      + 'leave it as-is, pass `null` to clear it, or pass a value to replace it. Any already-open connection to this '
      + 'source is closed so the next query reopens under the new settings — da_test_connection afterward to confirm.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'The data source to edit.' },
        host: { type: 'string', description: 'MySQL/PostgreSQL/ClickHouse only. Pass null to clear.' },
        port: { type: 'number', description: 'MySQL/PostgreSQL/ClickHouse only. Pass null to clear.' },
        database: { type: 'string', description: 'MySQL/PostgreSQL/ClickHouse: database name. SQLite: file path.' },
        user: { type: 'string', description: 'MySQL/PostgreSQL/ClickHouse only. Pass null to clear.' },
        passwordEnv: { type: 'string', description: 'Name of an environment variable holding the password. Pass null to clear.' },
        ssl: { type: 'boolean', description: 'MySQL/ClickHouse only. Pass null to clear.' },
        sslmode: {
          type: 'string',
          enum: [...SSL_MODES],
          description: 'PostgreSQL only. One of: disable, allow, prefer, require, verify-ca, verify-full. Pass null to clear.',
        },
        sslrootcert: { type: 'string', description: 'PostgreSQL only. Path to a PEM-encoded CA certificate file. Pass null to clear.' },
        readOnly: { type: 'boolean' },
        description: { type: 'string', description: 'Pass null to clear.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        required: ['name', 'engine', 'database', 'readOnly', 'createdAt'],
        properties: {
          name: { type: 'string' },
          engine: { type: 'string' },
          host: { type: 'string' },
          port: { type: 'number' },
          database: { type: 'string' },
          user: { type: 'string' },
          passwordEnv: { type: 'string' },
          ssl: { type: 'boolean' },
          sslmode: { type: 'string', enum: [...SSL_MODES] },
          sslrootcert: { type: 'string' },
          readOnly: { type: 'boolean' },
          description: { type: 'string' },
          createdAt: { type: 'string' },
        },
      },
      render(_args, value) {
        const record = value as { name: string, engine: string, readOnly: boolean }
        return [{
          type: 'text',
          text: `Updated data source \`${record.name}\` (${record.engine}, ${record.readOnly ? 'read-only' : 'read-write'}).`,
        }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      const name = requireString(args, 'name', NAME)

      const record = await ctx.dataAgent.editSource(name, {
        host: optionalNullableString(args, 'host', NAME),
        port: optionalNullableNumber(args, 'port', NAME),
        database: optionalString(args, 'database', NAME),
        user: optionalNullableString(args, 'user', NAME),
        passwordEnv: optionalNullableString(args, 'passwordEnv', NAME),
        ssl: optionalNullableBoolean(args, 'ssl', NAME),
        sslmode: optionalNullableEnum(args, 'sslmode', SSL_MODES, NAME),
        sslrootcert: optionalNullableString(args, 'sslrootcert', NAME),
        readOnly: optionalBoolean(args, 'readOnly', NAME),
        description: optionalNullableString(args, 'description', NAME),
      })

      return toSafeRecord(record)
    },
  })
}
