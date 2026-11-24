// Local structural types for the harness's Chat tool-card contract
// (`tool.call.toolview` keyed slot), verified directly against
// packages/client/ui-conversation/src/client/contract/records.ts and
// packages/client/ui-tool/src/client/contract/slots.ts at dsh-v0.2.2-rc.5 —
// not depending on the published `@deepseek-ai/dsh-client-*` packages
// (see ../dsh-client-ambient.d.ts for why).

export interface ToolContentBlock {
  type: string
  text?: string
}

/** A named model call whose complete arguments are still streaming (no `argsRaw` yet). */
export interface PreparingToolCall {
  readonly phase: 'preparing'
  callId: string
  name: string
}

/** A dispatched tool call with complete arguments and no result yet. */
export interface StartedToolCall {
  readonly phase: 'start'
  callId: string
  name: string
  readonly argsRaw: string
}

export type RunningToolCall = PreparingToolCall | StartedToolCall

export interface ToolResultNode {
  kind: 'tool-result'
  callId: string
  call: { name: string, argsRaw: string } | null
  content: readonly ToolContentBlock[]
  isError: boolean
  meta?: unknown
}

export type ToolCallBlock = RunningToolCall | ToolResultNode

/** The subset of `ToolCallOwnerProps` our read-only cards actually use. */
export type ToolRowProps =
  | { callId: string, toolName: string, readonly phase: 'preparing', readonly block: PreparingToolCall }
  | { callId: string, toolName: string, readonly phase: 'start', readonly block: StartedToolCall }
  | { callId: string, toolName: string, readonly phase: 'result', readonly block: ToolResultNode }

/** Whether a block has settled (as opposed to still preparing or running). */
export function isSettled(block: ToolCallBlock): block is ToolResultNode {
  return 'kind' in block
}

/** Raw text fallback for a settled block whose card model returned null (error, running, or malformed meta). */
export function fallbackText(block: ToolCallBlock): string {
  if (!isSettled(block)) return 'Running…'
  const text = block.content.filter(part => part.type === 'text' && part.text !== undefined).map(part => part.text).join('\n')
  return text.length > 0 ? text : (block.isError ? 'Failed.' : '(no output)')
}
