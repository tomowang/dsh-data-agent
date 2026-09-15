# Changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-09-15

### Bug Fixes

- Omit undefined comment/nativeComment keys from get_schema output
- Omit undefined optional keys from add_data_source output
- Omit undefined comment keys from MySQL/Postgres adapter output
- Surface connection-test failure when the connection itself fails to open
- Rebuild the client bundle under the renamed package id

### CI/Build

- Publish to npm via tag-triggered release workflow

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

