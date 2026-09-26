# Changelog

All notable changes to this project are documented in this file.

## [0.4.1] - 2026-09-26

### Bug Fixes

- Stop postgres sources from sending the host's PGPASSWORD
- Stop runaway sqlite queries from freezing the host
- Refuse sqlite attach and vacuum into from chat
- Refuse functions that escape read-only mode
- Validate data-source input from the settings api

## [0.4.0] - 2026-09-26

### Bug Fixes

- Enforce read-only at the database and cap query rows while reading
- Restrict passwordEnv to DSH_DA_* and keep credentials out of chat tools
- Restrict chat-set SQLite paths to approved sqliteChatDirs
- Only allow chat tools to turn read-only on, never off
- Correct MySQL write results, ClickHouse 64-bit precision, and JSON cells
- Check Host against DNS rebinding and require JSON POST on settings routes
- Silence ClickHouse client logging of deliberate aborts
- Unregister web routes when the plugin unloads
- Use document-relative URLs for the settings API
- Move the settings API onto the harness's authenticated /api channel

### CI/Build

- Run adapter integration tests against real databases

### Chores

- Declare the dsh 0.1.7-rc.2 runtime requirement as a peer range

### Documentation

- Add demo video, screenshot, and architecture diagram to README
- Add npm version, CI status, and license badges to README
- Update demo video link in README.md
- Add dsh-market install instructions to README
- Point the CI badge at the ci workflow and add a release badge

## [0.3.0] - 2026-09-17

### Bug Fixes

- Wire schema-tree table expand in chat get-schema card

### Documentation

- Add build-approval step to install instructions

### Features

- Add a Tools tab to the settings panel
- Add tooltip to password env var field label
- Default new data source engine to mysql

### UI

- Reorder engine dropdown to mysql, postgres, sqlite, clickhouse

## [0.2.1] - 2026-09-17

### CI/Build

- Restore npm registry-url setup for OIDC trusted publishing

## [0.2.0] - 2026-09-17

### Bug Fixes

- Coerce mysql column count to a number in get_schema
- Auto-dismiss the data source connection test status line
- Show a loading state on the view-schema button
- Compile the host half to lib/ instead of shipping raw .ts

### CI/Build

- Upgrade github actions to latest versions

### Chores

- Upgrade npm dependencies to latest
- Unify host/client build scripts, add watch:host and watch

### Documentation

- Tidy README, drop stale v1 limitation

### Features

- Localize the Data Agent settings section
- Show engine brand icons for data sources
- Show a GitHub link and version tag in the settings title bar
- Add ClickHouse as a supported data source engine
- Split chart rendering out of da_run_sql into da_render_chart
- Support stacked bar charts in da_render_chart
- Switch da_render_chart to chart.js, add static PNG output

### Refactor

- Prefix tool ids with da_

### UI

- Move the description field to its own full-width row
- Use consistent title-case labels for postgres SSL modes

## [0.1.1] - 2026-09-15

### Bug Fixes

- Omit undefined comment/nativeComment keys from get_schema output
- Omit undefined optional keys from add_data_source output
- Omit undefined comment keys from MySQL/Postgres adapter output
- Surface connection-test failure when the connection itself fails to open
- Rebuild the client bundle under the renamed package id
- Satisfy noUncheckedIndexedAccess in schema-comments test

### CI/Build

- Publish to npm via tag-triggered release workflow
- Drop the pnpm/action-setup version pin

### Chores

- Init project
- Add MIT license
- Scaffold dsh plugin bundle project
- Stop tracking the client bundle sourcemap in git
- Drop the git-install path, stop tracking lib/client.js

### Documentation

- Describe the finished plugin and its dev workflow (M7)
- Add AGENTS.md with the commit message convention

### Features

- Reproduce the Web Client browser-bundle contract (M0)
- Data-source vocabulary and JSON persistence (M1)
- DataSourceRegistry and the three engine adapters (M2 + M4 early)
- SQL read-only classifier and all eight host tools (M3)
- Chat Web cards for run_sql and get_schema (M5)
- Settings-page data-source management (M6)
- Custom nav icon for the Data Sources settings section
- PostgreSQL sslmode support (disable/allow/prefer/require/verify-ca/verify-full)
- Support editing a data source, from chat and Settings

### Refactor

- Rename data source id to name
- Drive the add-data-source form from a per-engine field schema

### UI

- Match the Models settings page look for Data Sources
- Spread data source row controls across three rows

