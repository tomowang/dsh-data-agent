/**
 * Structural failure from the registry or an adapter — the kind of failure a
 * caller might branch on programmatically, hence the stable `.code`. Tool
 * input mistakes (bad SQL, unknown chart column, ...) are plain `Error`s
 * thrown directly from the owning tool instead; see `sql/classify.ts` and the
 * individual tool files.
 */
export class DataAgentError extends Error {
  readonly code: string

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
    this.name = new.target.name
  }
}

export const DUPLICATE_SOURCE_CODE = 'DUPLICATE_SOURCE'
export const SOURCE_NOT_FOUND_CODE = 'SOURCE_NOT_FOUND'
export const CONNECTION_FAILED_CODE = 'CONNECTION_FAILED'
export const UNSUPPORTED_ENGINE_CODE = 'UNSUPPORTED_ENGINE'
export const REGISTRY_DISPOSED_CODE = 'REGISTRY_DISPOSED'
export const TABLE_NOT_FOUND_CODE = 'TABLE_NOT_FOUND'
