// Local structural types for the harness's tool-registration contract
// (`ctx.tools.register()`). Deliberately NOT depending on the published
// `@deepseek-ai/dsh-tools` package: its npm releases (0.0.1-rc.1) are far
// behind the current monorepo source at the installed `dsh` CLI's version
// line (0.1.5-rc.2) — e.g. its `defineTool` helper's shape has drifted
// substantially. `ctx.tools.register()` accepts a raw JSON-Schema
// `ToolDefinition` directly (this is how MCP-sourced tools arrive, per the
// harness's own extension cookbook), so we author that shape by hand and
// validate arguments ourselves per tool instead of relying on `defineTool`'s
// automatic pre-validation. Verified directly against
// packages/core/tools/src/{index,schema,json-schema}.ts in the harness
// checkout, not guessed.

/** The enforced JSON Schema subset the harness accepts for tool parameters/output. */
export interface JsonSchemaNode {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  oneOf?: JsonSchemaNode[]
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  additionalProperties?: boolean
  items?: JsonSchemaNode
  enum?: (string | number | boolean | null)[]
  const?: string | number | boolean | null
  description?: string
}

export interface ToolTextContentBlock {
  type: 'text'
  text: string
}

export type ToolContentBlock = ToolTextContentBlock

export interface ToolRunContext {
  readonly signal?: AbortSignal
}

export interface ToolOutputDefinition {
  readonly schema: JsonSchemaNode
  render(args: unknown, value: unknown): ToolContentBlock[]
  presentationMeta?(args: unknown, value: unknown): unknown
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: JsonSchemaNode
  readonly output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
}

declare module '@deepseek-ai/cordis' {
  interface ToolsService {
    register(definition: ToolDefinition): () => void
  }

  interface Context {
    tools: ToolsService
  }
}

/** Thrown for a self-correctable-by-the-model mistake (bad args, disallowed SQL, ...). */
export class ToolInputError extends Error {}

/** Narrow `unknown` args to a plain record, or reject with a clear message. */
export function asRecord(args: unknown, toolName: string): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new ToolInputError(`${toolName}: expected an object of arguments`)
  }
  return args as Record<string, unknown>
}

export function requireString(record: Record<string, unknown>, key: string, toolName: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new ToolInputError(`${toolName}: "${key}" is required and must be a non-empty string`)
  }
  return value
}

export function optionalString(record: Record<string, unknown>, key: string, toolName: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new ToolInputError(`${toolName}: "${key}" must be a string`)
  return value
}

export function optionalNumber(record: Record<string, unknown>, key: string, toolName: string): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ToolInputError(`${toolName}: "${key}" must be a finite number`)
  }
  return value
}

export function optionalBoolean(record: Record<string, unknown>, key: string, toolName: string): boolean | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new ToolInputError(`${toolName}: "${key}" must be a boolean`)
  return value
}

/** Three-way form for a patch field: `undefined` (not provided, leave unchanged), `null` (clear), or a value (set). */
export function optionalNullableString(record: Record<string, unknown>, key: string, toolName: string): string | null | undefined {
  const value = record[key]
  if (value === undefined || value === null) return value
  if (typeof value !== 'string') throw new ToolInputError(`${toolName}: "${key}" must be a string or null`)
  return value
}

export function optionalNullableNumber(record: Record<string, unknown>, key: string, toolName: string): number | null | undefined {
  const value = record[key]
  if (value === undefined || value === null) return value
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ToolInputError(`${toolName}: "${key}" must be a finite number or null`)
  }
  return value
}

export function optionalNullableBoolean(record: Record<string, unknown>, key: string, toolName: string): boolean | null | undefined {
  const value = record[key]
  if (value === undefined || value === null) return value
  if (typeof value !== 'boolean') throw new ToolInputError(`${toolName}: "${key}" must be a boolean or null`)
  return value
}

export function optionalNullableEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  toolName: string,
): T | null | undefined {
  const value = record[key]
  if (value === undefined || value === null) return value
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ToolInputError(`${toolName}: "${key}" must be one of ${allowed.join(', ')}, or null`)
  }
  return value as T
}

export function optionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  toolName: string,
): T | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ToolInputError(`${toolName}: "${key}" must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

export function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  toolName: string,
): T {
  const value = record[key]
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ToolInputError(`${toolName}: "${key}" must be one of ${allowed.join(', ')}`)
  }
  return value as T
}
