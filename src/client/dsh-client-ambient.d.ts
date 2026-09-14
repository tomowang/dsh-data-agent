// Minimal local ambient typings for the harness's Client-side Cordis context
// extensions we touch from the browser bundle (`ctx.slots`). We deliberately
// do NOT depend on the published `@deepseek-ai/dsh-client-*` packages for
// this: at the time of writing, several of them are very early prereleases
// with a broken registry dependency chain (`dsh-client-ui-tool`'s peer
// `dsh-client-runtime` depends on a `dsh-compact` package that does not exist
// on npm at all). None of this matters for what actually runs in the
// browser: `@deepseek-ai/dsh-client-ui-slots` etc. are `external` in our
// esbuild bundle (see scripts/build-client.mjs) and resolved at runtime by
// the host's own already-loaded instances, so these declarations exist only
// to satisfy the TypeScript compiler for our own source, not to ship code.
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface SlotChildDescriptor {
    kind: 'single' | 'list'
    scope?: string
  }

  interface SlotRegistration<Props> {
    name: string
    /** Discriminant for a `kind: 'keyed'` slot (e.g. `tool.call.toolview`). */
    key?: string
    /** Discriminant + nav identity for a `kind: 'list'` slot (e.g. `settings.section`). */
    id?: string
    /** Nav/list position; lower sorts first. */
    order?: number
    /** Registrant-localized display text — a function, re-invoked on locale change. */
    label?: () => string
    locale?: string
    children?: Record<string, SlotChildDescriptor>
    inject?: () => Record<string, unknown>
  }

  interface SlotsService {
    /** Register a component into a keyed or list slot; returns its disposer. */
    register<Props>(registration: SlotRegistration<Props>, component: (props: Props) => unknown): () => void
    /** Defer a slot registration until the named slot exists, re-running `factory` on slot changes. */
    inject(slotName: string, factory: () => (() => void) | void): void
  }

  interface Context {
    slots: SlotsService
  }
}
