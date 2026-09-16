// Builds src/client/index.ts into lib/client.js, reproducing the DeepSeek
// Harness Web Client's (unpublished) browser-bundle module-loader contract:
// a single CJS file wrapped in `window.__ModuleLoader__.load({ id, factory })`,
// with the harness's own platform modules left external so this bundle shares
// the host's already-loaded React/Cordis/UI-primitive instances instead of
// bundling duplicates. See packages/client/web/src/platform.ts (PLATFORM_MODULES)
// and packages/client/tsdown.client.ts in the deepseek-harness checkout for the
// contract this script reproduces by hand (that helper is monorepo-internal
// and not published for out-of-tree plugins to import).
import { readFileSync } from 'node:fs'
import * as esbuild from 'esbuild'

const PACKAGE_ID = '@tomowang/dsh-data-agent'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const REPO_URL = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')

const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  jsx: 'automatic',
  logLevel: 'info',
  external: PLATFORM_EXTERNALS,
  define: {
    __DSH_DATA_AGENT_VERSION__: JSON.stringify(pkg.version),
    __DSH_DATA_AGENT_REPO_URL__: JSON.stringify(REPO_URL),
  },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
}

if (watch) {
  const context = await esbuild.context(options)
  await context.watch()
  console.log('[build-client] watching for changes...')
} else {
  await esbuild.build(options)
}
