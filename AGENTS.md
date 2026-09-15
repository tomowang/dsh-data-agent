# AGENTS.md

Guidance for agents (and humans) working in this repo. See `README.md` for
the full feature/setup/dev-workflow writeup — this file covers conventions
not already there.

## Project shape

A DeepSeek Harness (`dsh`) plugin: `src/` is the Host half (Node, Cordis
plugin, the eight chat tools, the Settings-API routes); `src/client/` is a
separate browser bundle (`lib/client.js`, built with esbuild) providing the
chat toolviews and the Settings → Data Sources panel. See `README.md`
→ "Project layout" for the full file map.

## Commands

- `pnpm run typecheck` — type-checks both the Host (`tsconfig.json`) and
  Client (`tsconfig.client.json`) source; run after any change.
- `pnpm run test` — vitest.
- `pnpm run build:client` / `watch:client` — rebuild `lib/client.js`; required
  after any change under `src/client/` (the browser loads the built file, not
  the TypeScript source).
- `pnpm run dev` — build the client bundle and link this plugin into the
  local `web` profile for manual verification.

## Commit messages

Conventional Commits: `<type>: <summary>`, imperative mood, lowercase,
no trailing period. Body (optional) explains *why*, wrapped, blank line
after the summary.

Types used in this repo's history:

| type    | for |
|---------|-----|
| `feat`  | new capability (a tool, an adapter, a settings panel) |
| `fix`   | bug fix |
| `ui`    | visual/styling changes with no behavior change |
| `docs`  | README/AGENTS.md/comments only |
| `chore` | tooling, deps, scaffolding, repo housekeeping |
| `refactor` | internal restructuring, no behavior or visual change |
| `test`  | test-only changes |
| `ci`    | CI/build-pipeline configuration |

Example: `git log --oneline` in this repo for real examples.
