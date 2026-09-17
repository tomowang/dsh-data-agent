# dsh-data-agent

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin for managing database connections and running SQL, both conversationally and from the Web UI's Settings page.

## Features

- **Data-source management** — register MySQL, PostgreSQL, SQLite, or ClickHouse connections (`da_add_data_source`/`da_edit_data_source`/`da_remove_data_source`/`da_list_data_sources`), or manage them from Settings → Data Sources.
- **Connection checks & schema browsing** — `da_test_connection` and `da_get_schema` (database overview or full column detail for one table), rendered as a Markdown table in chat and as a rich, expandable browser in both the chat card and the Settings schema viewer.
- **Table/column comments** — `da_set_comment` from chat, or click-to-edit inline in the Settings schema viewer; both write to the same store.
- **SQL execution with a read-only toggle** — `da_run_sql`, AST-verified (not string-matched) to reject write statements on a read-only source and to always reject statement-stacking. Toggle a source's read-only flag anytime with `da_set_read_only` (or the checkbox in Settings).
- **Charts** — `da_render_chart` renders a `chart.js` bar/stacked-bar/line/pie chart from either `data` (inline rows) or `resultId` (a prior `da_run_sql` call's result, referenced by id instead of resent — cached in memory per conversation for 30 minutes). Alongside the interactive Web UI chart, it also rasterizes a static PNG server-side (via `skia-canvas`) and returns a URL to it, so the chart can be embedded as a Markdown image in the model's own reply.

Secrets are never stored directly: connections reference a `passwordEnv` (an environment variable **name**), resolved at connect time via the harness's `ctx.credentials` seam when mounted, else `process.env`.

## Install

Requires a `web` profile already booted at least once (`dsh --profile web`).

```sh
# 1. Install the dsh launcher
npm install -g @deepseek-ai/dsh

# 2. Install this bundle into the web profile
dsh plugin --profile web add @tomowang/dsh-data-agent
```

`dsh` reconciles the profile manifest's `dsh.profile.bundles` list automatically (this package declares `dsh.bundle.patch`), fetching the published npm package — no local checkout or build step needed. Restart the `web` profile process to pick it up.

## Develop

```sh
pnpm install
pnpm run typecheck
pnpm run test
```

Scripts:

- `pnpm run typecheck` — type-check both the Host (`tsconfig.json`) and Client (`tsconfig.client.json`) source
- `pnpm run test` — run tests (vitest); `tests/` cover SQLite in-process (no server needed) plus the SQL classifier, persistence, and registry logic — to exercise the MySQL/PostgreSQL/ClickHouse adapters, register a source against a reachable instance (a local Docker container works fine) and run `da_test_connection`/`da_get_schema`/`da_run_sql` from there
- `pnpm run build` — build both halves to `lib/` (`build:host` + `build:client`)
- `pnpm run build:host` / `build:client` (or `watch:host` / `watch:client`, or plain `watch` for both at once) — build one half only
- `pnpm run dev` — build both halves and link this plugin into the local `web` profile (see below)

### Project layout

```
src/
  index.ts                composition root: Config, apply() — mounts the registry, tools, the Settings-API routes, and the chart-image route
  data-source/
    types.ts, errors.ts   shared vocabulary and stable error codes
    registry.ts           DataSourceRegistry (ctx.dataAgent): the Map-based connection registry
    credential.ts         passwordEnv resolution (soft ctx.get('credentials'), else process.env)
    schema-comments.ts    merges comments.json into a raw schema result (shared by the tool and the Settings route)
    persistence/          sources.json / comments.json (atomic, cross-process-safe)
    adapters/              one DataSourceAdapter implementation per engine (mysql2, pg, node:sqlite, @clickhouse/client)
  sql/classify.ts         node-sql-parser-based read-only + single-statement enforcement
  tools/                  the ten model-facing tools (one file each), plus QueryResultCache (ctx.queryResultCache),
                          chart-config.ts (shared chart.js config builder), and the chart-image render/store/route
                          backing da_render_chart's static PNG output (ctx.chartImageStore)
  settings-api/           raw ctx.webServer routes + Origin trust check backing the Settings panel
src/client/                the browser bundle (see below)
  index.ts                client plugin entry: registers the three chat toolviews + the Settings section
  tool/                   da_run_sql / da_get_schema / da_render_chart chat cards (card models + components + toolview registrations)
  settings/               the Data Sources settings panel + its fetch() API client
  shared/SchemaTree.tsx   table/column browser shared by the chat card and the Settings panel
scripts/build-client.mjs esbuild build for src/client -> lib/client.js
cordis.patch.yml          the bundle layer applied when a profile lists this package
```

### Developing against the `web` profile

Local development only — this links your working copy into a profile in place of the published package, so you can iterate without cutting a release. It assumes a globally installed `dsh` CLI (`npm i -g @deepseek-ai/dsh`, or any `dsh` resolvable on `PATH`) and a `web` profile already booted at least once (`dsh --profile web`).

Link this checkout into the `web` profile and register it as a bundle:

```sh
pnpm run dev
# same as: pnpm run build && dsh plugin --profile web add .
```

This is one-time (or re-run after changing `package.json` dependencies): pnpm `link:`s this directory into the profile's `node_modules` and appends `@tomowang/dsh-data-agent` to the profile's `dsh.profile.bundles`. Verify the layer, then boot:

```sh
dsh --profile web --dump-config   # confirm the "# == @tomowang/dsh-data-agent" layer
dsh --profile web
```

Because it's a symlink, no need to re-run `add` after an edit — but the profile loads `lib/`, never `src/` directly, for _either_ half: rebuild with `pnpm run build` (or the narrower scripts above) before the next boot picks up an edit. There's no hot-reload for either half (checked: `@deepseek-ai/cordis-plugin-hmr` explicitly excludes anything resolved through `node_modules`, which is how a linked profile always loads this plugin) — **a running `dsh --profile web` process needs restarting** to pick up a rebuilt bundle, reloading the page alone is not enough (the plugin bundle list is fixed at process boot). `dsh plugin --profile web remove @tomowang/dsh-data-agent` undoes the install.

For quick Host-only throwaway testing without touching any profile (also local development only; skips the client bundle, so no Web UI cards/settings — use the linked-profile flow above for that), overlay the source file directly against a `deepseek-harness` source checkout:

```sh
cd /path/to/deepseek-harness   # your local checkout
pnpm dsh web --patch <(cat <<EOF
- insert:
    - id: data-agent
      name: '/path/to/dsh-data-agent/src/index.ts'
      config:
        defaultMaxRows: 500
EOF
)
```

See `deepseek-harness`'s [plugin tutorials](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md) and [packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) for the full plugin/bundle model.

## Known v1 limitations

- SQL placeholder syntax isn't unified across engines: `?` for MySQL/SQLite, `$1, $2, ...` for PostgreSQL, `{p1:Type}, {p2:Type}, ...` for ClickHouse (its HTTP interface only supports named parameters; `params` binds to them positionally as `p1`, `p2`, ...).
- `da_run_sql`'s safety check rejects any statement the parser can't classify (e.g. SQLite `PRAGMA`, some PostgreSQL `EXPLAIN` forms, ClickHouse `FORMAT` clauses) rather than guessing — use `da_get_schema` for introspection instead of raw `PRAGMA`, and omit `FORMAT` (the ClickHouse adapter always requests `FORMAT JSON` itself).
- `node-sql-parser` (the AST-based safety check) has no dedicated ClickHouse dialect; ClickHouse sources are classified against its PostgreSQL grammar, which is close enough for common SELECT/DDL/DML but will reject some ClickHouse-specific syntax as unparseable rather than misclassifying it.
- The Settings panel's raw HTTP routes carry a hand-rolled `Origin` check rather than the harness's own `/api` trust fence (which is specific to `ctx.remote` calls) — adequate for the existing loopback-only threat model, not a claim of parity.
