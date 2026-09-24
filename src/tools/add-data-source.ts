import type { Context } from '@deepseek-ai/cordis'
import type { Engine } from '../data-source/types.ts'
import { assertChatReadOnlyChange, rejectChatCredentials, toSafeRecord } from './shared.ts'
import { assertChatSqlitePath } from './sqlite-path.ts'
import {
  asRecord,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
  requireEnum,
  requireString,
} from './tool-types.ts'

const NAME = 'da_add_data_source'
const ENGINES: readonly Engine[] = ['mysql', 'postgres', 'sqlite', 'clickhouse']
const SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const

export function applyAddDataSourceTool(ctx: Context, sqliteChatDirs: readonly string[]): void {
  ctx.tools.register({
    name: NAME,
    description:
      'Register a new database connection. For MySQL/PostgreSQL/ClickHouse, provide host/port/database/user. '
      + 'Credentials cannot be attached from chat: if the database requires a password, register the source here, '
      + 'then ask the user to set its password environment variable in Settings → Data Sources. For PostgreSQL, `sslmode` controls encryption/verification (mirrors libpq): `disable` '
      + '(default), `allow`/`prefer` (negotiated — try one encryption state, retry with the other if that whole '
      + 'connection attempt fails), `require` (encrypted, no verification), `verify-ca` (encrypted, verifies the '
      + "certificate chain), or `verify-full` (encrypted, verifies the chain and hostname). `verify-ca`/`verify-full` "
      + 'should be paired with `sslrootcert` unless the certificate already chains to a CA Node trusts by default. '
      + 'For SQLite, `database` is the file path and the other connection fields are ignored; from chat, the path must be '
      + 'inside a directory the user approved in the plugin\'s `sqliteChatDirs` config — otherwise ask the user to add it '
      + 'in Settings → Data Sources. For ClickHouse, `ssl` '
      + 'selects `https://` for its HTTP interface (default port 8123, or 8443 with `ssl`). The connection is not '
      + 'tested here — use da_test_connection afterward.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'engine', 'database'],
      properties: {
        name: { type: 'string', description: 'A short unique name for this data source, e.g. "prod-mysql".' },
        engine: { type: 'string', enum: [...ENGINES], description: 'One of: mysql, postgres, sqlite, clickhouse.' },
        host: { type: 'string', description: 'MySQL/PostgreSQL/ClickHouse only.' },
        port: { type: 'number', description: 'MySQL/PostgreSQL/ClickHouse only.' },
        database: { type: 'string', description: 'MySQL/PostgreSQL/ClickHouse: database name. SQLite: file path.' },
        user: { type: 'string', description: 'MySQL/PostgreSQL/ClickHouse only.' },
        ssl: { type: 'boolean', description: 'MySQL/ClickHouse only. PostgreSQL uses `sslmode` instead.' },
        sslmode: {
          type: 'string',
          enum: [...SSL_MODES],
          description: 'PostgreSQL only. One of: disable, allow, prefer, require, verify-ca, verify-full. Defaults to `disable`.',
        },
        sslrootcert: {
          type: 'string',
          description: 'PostgreSQL only. Path to a PEM-encoded CA certificate file, used when `sslmode` is `verify-ca` or `verify-full`.',
        },
        readOnly: { type: 'boolean', description: 'Must be true (the default) from chat; only the user can make a source read-write, in Settings.' },
        description: { type: 'string' },
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
          text: `Added data source \`${record.name}\` (${record.engine}, ${record.readOnly ? 'read-only' : 'read-write'}).`,
        }]
      },
    },
    async execute(rawArgs) {
      const args = asRecord(rawArgs, NAME)
      rejectChatCredentials(args, NAME)
      const name = requireString(args, 'name', NAME)
      const engine = requireEnum(args, 'engine', ENGINES, NAME)
      const database = requireString(args, 'database', NAME)
      if (engine === 'sqlite') await assertChatSqlitePath(database, sqliteChatDirs, NAME)
      const readOnly = optionalBoolean(args, 'readOnly', NAME) ?? true
      assertChatReadOnlyChange(readOnly, undefined, NAME)

      const record = await ctx.dataAgent.addSource({
        name,
        engine,
        database,
        host: optionalString(args, 'host', NAME),
        port: optionalNumber(args, 'port', NAME),
        user: optionalString(args, 'user', NAME),
        ssl: optionalBoolean(args, 'ssl', NAME),
        sslmode: optionalEnum(args, 'sslmode', SSL_MODES, NAME),
        sslrootcert: optionalString(args, 'sslrootcert', NAME),
        readOnly,
        description: optionalString(args, 'description', NAME),
      })

      return toSafeRecord(record)
    },
  })
}
