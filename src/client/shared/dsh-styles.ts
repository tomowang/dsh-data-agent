/**
 * Shared stylesheet for the plugin's browser-bundle UI (Settings panel +
 * SchemaTree, used by both the Settings viewer and the chat card). Written
 * as a plain injected `<style>` tag rather than CSS Modules — this is an
 * out-of-tree plugin with no published build helper for the harness's CSS
 * Modules pipeline (see README's "The browser bundle" section) — following
 * the same idempotent-injection pattern `settings-nav-icon.ts` already uses.
 * Every color/spacing choice rides the host's own `--dsw-alias-*` design
 * tokens (see `ui-settings-models/src/client/ModelsSection.module.css` in
 * the deepseek-harness checkout) so the panel matches Settings → Models
 * instead of hand-picked literals that would ignore the active theme.
 */

const STYLE_TAG_ID = 'dsh-data-agent-styles'

const CSS = `
.dsh-da-section { display: flex; flex-direction: column; gap: 12px; max-width: 720px; color: var(--dsw-alias-label-primary); }
.dsh-da-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-da-intro { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-tertiary); }

.dsh-da-rows { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.dsh-da-empty { margin: 0; padding: 20px; border: 1px dashed var(--dsw-alias-border-l3); border-radius: 12px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.dsh-da-rowCard { border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.dsh-da-rowHead { display: flex; align-items: center; gap: 10px; }
.dsh-da-rowIdentity { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; }
.dsh-da-rowName { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); font-family: var(--ds-font-family-code); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-da-rowMeta { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-da-rowActions { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; flex: none; }

.dsh-da-secondaryButton, .dsh-da-dangerButton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 36px; padding: 0 14px; border-radius: 18px; font: inherit; font-size: 14px; line-height: 22px; cursor: pointer;
}
.dsh-da-secondaryButton { border: 0.5px solid var(--dsw-alias-border-l3); background: transparent; color: var(--dsw-alias-label-primary); }
.dsh-da-secondaryButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-da-dangerButton { border: none; background: transparent; color: var(--dsw-alias-state-error-primary); }
.dsh-da-dangerButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger); }
.dsh-da-secondaryButton:disabled, .dsh-da-dangerButton:disabled { opacity: 0.4; cursor: default; }

/* Row-action controls take the dense capsule size. */
.dsh-da-rowActions .dsh-da-secondaryButton, .dsh-da-rowActions .dsh-da-dangerButton {
  height: 28px; padding: 0 10px; border-radius: 14px; font-size: 12px; line-height: 18px;
}

.dsh-da-primaryButton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 36px; padding: 0 14px; border: none; border-radius: 18px; font: inherit; font-size: 14px; line-height: 22px; cursor: pointer;
  background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground);
}
.dsh-da-primaryButton:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-da-primaryButton:disabled { opacity: 0.4; cursor: default; }

.dsh-da-statusLine { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 18px; }
.dsh-da-statusOk { color: var(--dsw-alias-state-success-primary); }
.dsh-da-statusErr { color: var(--dsw-alias-state-error-primary); }

.dsh-da-schemaSection { border-top: 0.5px solid var(--dsw-alias-border-l2); padding-top: 10px; }

.dsh-da-addButton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; height: 44px; border: 1px dashed var(--dsw-alias-border-l3); border-radius: 16px;
  background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; cursor: pointer;
}
.dsh-da-addButton:hover { background: var(--dsw-alias-interactive-bg-hover); }

.dsh-da-editor { border-radius: 12px; background: var(--dsw-alias-bg-module-platform); padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.dsh-da-editorTitle { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); margin: 0; }
.dsh-da-fieldGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.dsh-da-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-da-fieldLabel { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dsh-da-switchRow { display: flex; align-items: center; gap: 8px; }
.dsh-da-switchLabel { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-da-editorActions { display: flex; justify-content: flex-end; gap: 8px; }

.dsh-da-selectInput {
  box-sizing: border-box; width: 100%; height: 32px; padding: 0 32px 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 8px; font: inherit; font-size: 14px; line-height: 22px;
  background-color: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  appearance: none; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 12px 12px;
}
.dsh-da-selectInput:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }

.dsh-da-error { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.dsh-da-loading { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }

.dsh-da-tableWrap { overflow-x: auto; margin-top: 4px; }
.dsh-da-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.dsh-da-table th, .dsh-da-table td { padding: 6px 8px; text-align: left; border-bottom: 0.5px solid var(--dsw-alias-border-l4); color: var(--dsw-alias-label-primary); vertical-align: top; }
.dsh-da-table th { color: var(--dsw-alias-label-tertiary); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; }
.dsh-da-tableName { font-family: var(--ds-font-family-code); }
.dsh-da-tableMeta { color: var(--dsw-alias-label-tertiary); font-weight: 400; }
.dsh-da-truncated { margin: 4px 0 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

.dsh-da-commentButton { background: none; border: none; padding: 0; cursor: pointer; color: var(--dsw-alias-label-secondary); text-decoration: underline dotted; font: inherit; font-size: 12px; text-align: left; }
.dsh-da-commentButton:hover { color: var(--dsw-alias-label-primary); }
.dsh-da-commentPlaceholder { color: var(--dsw-alias-label-dimmed); font-style: italic; }
.dsh-da-commentEditRow { display: flex; gap: 6px; align-items: center; }

.dsh-da-iconButton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; flex: none;
}
.dsh-da-iconButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-da-iconButton:disabled { cursor: default; opacity: 0.4; }

.dsh-da-input {
  box-sizing: border-box; width: 100%; height: 26px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 6px; font: inherit; font-size: 12px; line-height: 20px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
}
.dsh-da-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
`

/**
 * Append the shared stylesheet once per document. Idempotent so repeated
 * calls (multiple mounting components, HMR reloads) never pile up
 * duplicate `<style>` tags.
 */
export function ensureDshStyles(): void {
  if (document.getElementById(STYLE_TAG_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_TAG_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
