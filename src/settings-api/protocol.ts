// Shared by the Host routes and the browser client, so it must stay free of
// Node imports: the client bundle imports it directly.

/**
 * Host route key for the Settings API: an absolute path below the harness's
 * shared `/api` channel, where `ctx.connection.fetch` routes live.
 */
export const SETTINGS_API_PATH = '/api/dsh-data-agent'

/**
 * Browser form of {@link SETTINGS_API_PATH}: document-relative, so it resolves
 * under whatever mount served the page (the shell sets `<base href="./">`) —
 * the harness's own `*_PATH` / `*_ROUTE` convention.
 */
export const SETTINGS_API_ROUTE = SETTINGS_API_PATH.slice(1)
