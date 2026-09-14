# dsh-data-agent

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin bundle.

## Prerequisites

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack-enabled pnpm (this repo pins `pnpm@11.7.0`; run `corepack enable` if `pnpm --version` does not resolve through Corepack)
- A checkout of [`deepseek-harness`](../deepseek-harness) to boot the plugin against during development

## Setup

```sh
pnpm install
pnpm run typecheck
```

## Project layout

```
src/index.ts        the plugin entry point (exports name/Config/apply)
cordis.patch.yml     the bundle layer applied when a profile lists this package
package.json         declares dsh.bundle.patch so `dsh plugin add` recognizes it
```

## Developing against the `web` profile

This assumes a globally installed `dsh` CLI (`npm i -g @deepseek-ai/dsh`, or any `dsh` resolvable on `PATH`) and a `web` profile already booted at least once (`dsh --profile web`).

Link this checkout into the `web` profile and register it as a bundle:

```sh
pnpm run dev
# same as: dsh plugin --profile web add .
```

This is one-time (or re-run after changing `package.json` dependencies): pnpm `link:`s this directory into the profile's `node_modules` and appends `dsh-data-agent` to the profile's `dsh.profile.bundles`. Verify the layer, then boot:

```sh
dsh --profile web --dump-config   # confirm the "# == dsh-data-agent" layer
dsh --profile web
```

Because it's a symlink, edits to `src/index.ts` are picked up the next time the `web` profile boots — no need to re-run `add`. `dsh plugin --profile web remove dsh-data-agent` undoes the install.

For quick throwaway testing without touching any profile, overlay the source file directly against a `deepseek-harness` source checkout:

```sh
cd ../deepseek-harness
pnpm dsh web --patch <(cat <<EOF
- insert:
    - id: data-agent
      name: '$(cd ../dsh-data-agent && pwd)/src/index.ts'
      config:
        verbose: true
EOF
)
```

See `deepseek-harness`'s [plugin tutorials](../deepseek-harness/docs/user/develop/basic/index.md) and [packaging guide](../deepseek-harness/docs/user/develop/basic/publish.md) for the full plugin/bundle model.

## Scripts

- `pnpm run typecheck` — type-check `src/`
- `pnpm run test` — run tests (vitest)
- `pnpm run dev` — link this plugin into the local `web` profile (`dsh plugin --profile web add .`)
