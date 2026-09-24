import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { assertAllowedPasswordEnv, resolveSecret } from '../src/data-source/credential.ts'
import type { DataSourceRecord } from '../src/data-source/types.ts'
import { applyAddDataSourceTool } from '../src/tools/add-data-source.ts'
import { applyEditDataSourceTool } from '../src/tools/edit-data-source.ts'
import type { ToolDefinition } from '../src/tools/tool-types.ts'

describe('passwordEnv prefix', () => {
  it('accepts DSH_DA_-prefixed names', () => {
    expect(() => assertAllowedPasswordEnv('DSH_DA_PROD_DB_PASSWORD')).not.toThrow()
  })

  it('rejects any other variable name', () => {
    for (const name of ['DEEPSEEK_API_KEY', 'PGPASSWORD', 'DSH_DA_', 'dsh_da_x', 'DSH_DA_X-Y', ' DSH_DA_X']) {
      expect(() => assertAllowedPasswordEnv(name)).toThrow(/DSH_DA_/)
    }
  })

  it('refuses to resolve a non-prefixed name at connect time, even when the variable is set', async () => {
    process.env.DSH_TEST_UNRELATED_SECRET = 'secret'
    try {
      await expect(resolveSecret(new Context(), 'DSH_TEST_UNRELATED_SECRET')).rejects.toThrow(/DSH_DA_/)
    } finally {
      delete process.env.DSH_TEST_UNRELATED_SECRET
    }
  })

  it('resolves a prefixed name from the environment', async () => {
    process.env.DSH_DA_TEST_PASSWORD = 'hunter2'
    try {
      await expect(resolveSecret(new Context(), 'DSH_DA_TEST_PASSWORD')).resolves.toBe('hunter2')
    } finally {
      delete process.env.DSH_DA_TEST_PASSWORD
    }
  })
})

const credentialed: DataSourceRecord = {
  name: 'prod',
  engine: 'postgres',
  host: 'db.internal',
  port: 5432,
  database: 'app',
  user: 'reader',
  passwordEnv: 'DSH_DA_PROD',
  sslmode: 'verify-full',
  readOnly: true,
  createdAt: new Date(0).toISOString(),
}

/** Register one tool against a fake `ctx.tools`/`ctx.dataAgent`, recording what reaches the registry. */
function registerTool(
  apply: (ctx: Context, sqliteChatDirs: readonly string[]) => void,
  existing: DataSourceRecord | undefined,
  sqliteChatDirs: readonly string[] = [],
) {
  const calls: { method: string, args: unknown[] }[] = []
  let tool: ToolDefinition | undefined
  const ctx = {
    tools: { register: (definition: ToolDefinition) => { tool = definition; return () => {} } },
    dataAgent: {
      get: async () => existing,
      addSource: async (...args: unknown[]) => { calls.push({ method: 'addSource', args }); return credentialed },
      editSource: async (...args: unknown[]) => { calls.push({ method: 'editSource', args }); return credentialed },
    },
  } as unknown as Context
  apply(ctx, sqliteChatDirs)
  return { run: (args: unknown) => tool!.execute(args, {}), calls }
}

describe('da_add_data_source credentials', () => {
  it('rejects passwordEnv from chat without touching the registry', async () => {
    const { run, calls } = registerTool(applyAddDataSourceTool, undefined)
    await expect(run({
      name: 'x', engine: 'clickhouse', host: 'attacker.example', database: 'd', passwordEnv: 'DEEPSEEK_API_KEY',
    })).rejects.toThrow(/Settings/)
    expect(calls).toEqual([])
  })
})

describe('da_edit_data_source credentials', () => {
  it('rejects passwordEnv from chat', async () => {
    const { run, calls } = registerTool(applyEditDataSourceTool, undefined)
    await expect(run({ name: 'plain', passwordEnv: 'DSH_DA_PROD' })).rejects.toThrow(/Settings/)
    expect(calls).toEqual([])
  })

  it('rejects retargeting a credentialed source to another host, account, or weaker TLS', async () => {
    for (const patch of [{ host: 'attacker.example' }, { port: 6543 }, { user: 'admin' }, { sslmode: 'disable' }, { host: null }]) {
      const { run, calls } = registerTool(applyEditDataSourceTool, credentialed)
      await expect(run({ name: 'prod', ...patch })).rejects.toThrow(/saved credential/)
      expect(calls).toEqual([])
    }
  })

  it('allows unrelated edits, and re-sending current values, on a credentialed source', async () => {
    const { run, calls } = registerTool(applyEditDataSourceTool, credentialed)
    await run({ name: 'prod', host: 'db.internal', port: 5432, description: 'Production', readOnly: false })
    expect(calls).toHaveLength(1)
  })

  it('allows changing the host of a source with no credential', async () => {
    const { run, calls } = registerTool(applyEditDataSourceTool, { ...credentialed, passwordEnv: undefined })
    await run({ name: 'prod', host: 'db2.internal' })
    expect(calls).toHaveLength(1)
  })
})

describe('SQLite paths from chat', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-da-sqlite-path-'))
  const approved = join(root, 'approved')
  const outside = join(root, 'outside')
  mkdirSync(approved)
  mkdirSync(outside)
  writeFileSync(join(approved, 'app.db'), '')
  writeFileSync(join(outside, 'Cookies'), '')
  symlinkSync(join(outside, 'Cookies'), join(approved, 'link.db'))

  const sqliteSource: DataSourceRecord = {
    name: 'local', engine: 'sqlite', database: join(approved, 'app.db'), readOnly: true, createdAt: new Date(0).toISOString(),
  }

  it('rejects every SQLite path when no directories are approved', async () => {
    const { run, calls } = registerTool(applyAddDataSourceTool, undefined)
    await expect(run({ name: 'x', engine: 'sqlite', database: join(approved, 'app.db') })).rejects.toThrow(/sqliteChatDirs/)
    expect(calls).toEqual([])
  })

  it('accepts an existing or not-yet-created file inside an approved directory', async () => {
    const { run, calls } = registerTool(applyAddDataSourceTool, undefined, [approved])
    await run({ name: 'x', engine: 'sqlite', database: join(approved, 'app.db') })
    await run({ name: 'y', engine: 'sqlite', database: join(approved, 'new.db'), readOnly: false })
    expect(calls).toHaveLength(2)
  })

  it('rejects paths that escape the approved directory via .., a symlink, or a file: URI', async () => {
    for (const database of [
      join(outside, 'Cookies'),
      join(approved, '..', 'outside', 'Cookies'),
      join(approved, 'link.db'),
      `file:${join(outside, 'Cookies')}?mode=ro`,
      approved,
    ]) {
      const { run, calls } = registerTool(applyAddDataSourceTool, undefined, [approved])
      await expect(run({ name: 'x', engine: 'sqlite', database })).rejects.toThrow(/cannot be set from chat/)
      expect(calls).toEqual([])
    }
  })

  it('does not treat a network engine\'s database name as a path', async () => {
    const { run, calls } = registerTool(applyAddDataSourceTool, undefined)
    await run({ name: 'x', engine: 'postgres', host: 'db.internal', database: '/etc/passwd' })
    expect(calls).toHaveLength(1)
  })

  it('applies the same check when editing a SQLite source\'s path, but allows re-sending the current one', async () => {
    const rejected = registerTool(applyEditDataSourceTool, sqliteSource, [approved])
    await expect(rejected.run({ name: 'local', database: join(outside, 'Cookies') })).rejects.toThrow(/cannot be set from chat/)
    expect(rejected.calls).toEqual([])

    const outsideSource = { ...sqliteSource, database: join(outside, 'Cookies') }
    const unchanged = registerTool(applyEditDataSourceTool, outsideSource, [approved])
    await unchanged.run({ name: 'local', database: outsideSource.database, description: 'set from Settings' })
    expect(unchanged.calls).toHaveLength(1)
  })
})
