# AGENTS.md

Guidance for agents (and humans) working in this repo. See `README.md` for
the full feature/setup/dev-workflow writeup — this file covers conventions
not already there.

## Project shape

A DeepSeek Harness (`dsh`) plugin: `src/` is the Host half (Node, Cordis
plugin, the ten chat tools, the Settings-API routes); `src/client/` is a
separate browser bundle (`lib/client.js`, built with esbuild) providing the
chat toolviews and the Settings → Data Sources panel. See `README.md`
→ "Project layout" for the full file map.

## Commands

- `pnpm run typecheck` — type-checks both the Host (`tsconfig.json`) and
  Client (`tsconfig.client.json`) source; run after any change.
- `pnpm run test` — vitest.
- `pnpm run build` — rebuild both halves to `lib/` (`build:host` + `build:client`).
  Required after *any* source change before a linked `web` profile picks it
  up — the profile loads `lib/`, never `src/` directly, for either half.
- `pnpm run build:host` / `build:client` (or `watch:host` / `watch:client` to
  rebuild on every change, or plain `watch` for both at once) — rebuild one
  half only.
- `pnpm run dev` — build both halves and link this plugin into the local
  `web` profile for manual verification. Re-running `pnpm run build` (or
  `build:host`) and restarting the profile process is required after every
  later edit — there's no hot-reload for either half.

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
