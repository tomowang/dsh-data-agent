# dsh-data-agent

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin for managing database connections and running SQL, both conversationally and from the Web UI's Settings page.

## Features

- **Data-source management** — register MySQL, PostgreSQL, or SQLite connections (`add_data_source`/`remove_data_source`/`list_data_sources`), or manage them from Settings → Data Sources.
- **Connection checks & schema browsing** — `test_connection` and `get_schema` (database overview or full column detail for one table), rendered as a Markdown table in chat and as a rich, expandable browser in both the chat card and the Settings schema viewer.
- **Table/column comments** — `set_comment` from chat, or click-to-edit inline in the Settings schema viewer; both write to the same store.
- **SQL execution with a read-only toggle** — `run_sql`, AST-verified (not string-matched) to reject write statements on a read-only source and to always reject statement-stacking. Toggle a source's read-only flag anytime with `set_read_only` (or the checkbox in Settings).
- **Charts** — pass `chart: { type: 'bar'|'line'|'pie', x, y }` to `run_sql` for a `recharts` chart alongside the data table in the Web UI.

Secrets are never stored directly: connections reference a `passwordEnv` (an environment variable **name**), resolved at connect time via the harness's `ctx.credentials` seam when mounted, else `process.env`.

## Prerequisites

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack-enabled pnpm (this repo pins `pnpm@11.7.0`; run `corepack enable` if `pnpm --version` does not resolve through Corepack)
- A checkout of [`deepseek-harness`](../deepseek-harness) to read its docs/source against during development (not required to boot the plugin — see below)

## Setup

```sh
pnpm install
pnpm run typecheck
pnpm run test
```

## Project layout

```
src/
  index.ts                composition root: Config, apply() — mounts the registry, tools, and the Settings-API routes
  data-source/
    types.ts, errors.ts   shared vocabulary and stable error codes
    registry.ts           DataSourceRegistry (ctx.dataAgent): the Map-based connection registry
    credential.ts         passwordEnv resolution (soft ctx.get('credentials'), else process.env)
    schema-comments.ts    merges comments.json into a raw schema result (shared by the tool and the Settings route)
    persistence/          sources.json / comments.json (atomic, cross-process-safe)
    adapters/              one DataSourceAdapter implementation per engine (mysql2, pg, node:sqlite)
  sql/classify.ts         node-sql-parser-based read-only + single-statement enforcement
  tools/                  the eight model-facing tools (one file each)
  settings-api/           raw ctx.webServer routes + Origin trust check backing the Settings panel
src/client/                the browser bundle (see below)
  index.ts                client plugin entry: registers the two chat toolviews + the Settings section
  tool/                   run_sql / get_schema chat cards (card models + components + toolview registrations)
  settings/               the Data Sources settings panel + its fetch() API client
  shared/SchemaTree.tsx   table/column browser shared by the chat card and the Settings panel
scripts/build-client.mjs esbuild build for src/client -> lib/client.js
cordis.patch.yml          the bundle layer applied when a profile lists this package
```

## The browser bundle

The Web UI half (`src/client/`) is a separate esbuild bundle (`lib/client.js`), because the browser can't load TypeScript source directly. It reproduces the DeepSeek Harness Web Client's module-loader contract by hand (no published build helper exists for out-of-tree plugins): a single CJS file, the harness's own platform modules (`react`, `@deepseek-ai/cordis`, etc.) left external, wrapped in `window.__ModuleLoader__.load({ id, factory })`.

`lib/client.js` is committed (its sourcemap is not — regenerate with `pnpm run build:client`), so a plain `dsh plugin add` install works with no build step. Rebuild after any change under `src/client/`:

```sh
pnpm run build:client   # one-shot
pnpm run watch:client   # rebuild on change
```

## Developing against the `web` profile

This assumes a globally installed `dsh` CLI (`npm i -g @deepseek-ai/dsh`, or any `dsh` resolvable on `PATH`) and a `web` profile already booted at least once (`dsh --profile web`).

Link this checkout into the `web` profile and register it as a bundle:

```sh
pnpm run dev
# same as: pnpm run build:client && dsh plugin --profile web add .
```

This is one-time (or re-run after changing `package.json` dependencies): pnpm `link:`s this directory into the profile's `node_modules` and appends `dsh-data-agent` to the profile's `dsh.profile.bundles`. Verify the layer, then boot:

```sh
dsh --profile web --dump-config   # confirm the "# == dsh-data-agent" layer
dsh --profile web
```

Because it's a symlink, edits to `src/index.ts` (the Host half) are picked up the next time the `web` profile boots — no need to re-run `add`. Edits under `src/client/` need `pnpm run build:client` (or `watch:client`) first, since the browser loads the built `lib/client.js`, not the TypeScript source. Either way, **a running `dsh --profile web` process needs restarting** to pick up a changed plugin bundle — reloading the page alone is not enough (the plugin bundle list is fixed at process boot). `dsh plugin --profile web remove dsh-data-agent` undoes the install.

For quick Host-only throwaway testing without touching any profile (skips the client bundle, so no Web UI cards/settings — use the linked-profile flow above for that), overlay the source file directly against a `deepseek-harness` source checkout:

```sh
cd ../deepseek-harness
pnpm dsh web --patch <(cat <<EOF
- insert:
    - id: data-agent
      name: '$(cd ../dsh-data-agent && pwd)/src/index.ts'
      config:
        defaultMaxRows: 500
EOF
)
```

See `deepseek-harness`'s [plugin tutorials](../deepseek-harness/docs/user/develop/basic/index.md) and [packaging guide](../deepseek-harness/docs/user/develop/basic/publish.md) for the full plugin/bundle model.

## Testing against real MySQL/PostgreSQL

`tests/` cover SQLite in-process (no server needed) plus the SQL classifier, persistence, and registry logic. To exercise the MySQL/PostgreSQL adapters against a real server, register a source with `add_data_source` (or Settings → Data Sources) pointing at a reachable instance — a local Docker container works fine — and run `test_connection`/`get_schema`/`run_sql` from there.

## Known v1 limitations

- No update/upsert of connection details beyond the read-only toggle — remove and re-add for anything else (host, port, credentials, ...).
- SQL placeholder syntax isn't unified across engines: `?` for MySQL/SQLite, `$1, $2, ...` for PostgreSQL.
- `run_sql`'s safety check rejects any statement the parser can't classify (e.g. SQLite `PRAGMA`, some PostgreSQL `EXPLAIN` forms) rather than guessing — use `get_schema` for introspection instead of raw `PRAGMA`.
- The Settings panel's raw HTTP routes carry a hand-rolled `Origin` check rather than the harness's own `/api` trust fence (which is specific to `ctx.remote` calls) — adequate for the existing loopback-only threat model, not a claim of parity.

## Scripts

- `pnpm run typecheck` — type-check both the Host (`tsconfig.json`) and Client (`tsconfig.client.json`) source
- `pnpm run test` — run tests (vitest)
- `pnpm run build:client` / `watch:client` — build the browser bundle
- `pnpm run dev` — build the client bundle and link this plugin into the local `web` profile
