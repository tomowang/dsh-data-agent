import type { Context } from '@deepseek-ai/cordis'
import { CONNECTION_FAILED_CODE, DataAgentError } from '../data-source/errors.ts'
import type { ConnectionTestResult } from '../data-source/types.ts'
import { asRecord, requireString } from './tool-types.ts'

const NAME = 'test_connection'

export function applyTestConnectionTool(ctx: Context): void {
  ctx.tools.register({
    name: NAME,
    description: 'Check whether a registered data source is currently reachable. A failed connection is reported as data, not an error.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    output: {
      schema: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          latencyMs: { type: 'number' },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
      render(_args, value) {
        const result = value as ConnectionTestResult
        const text = result.ok
          ? `Connected in ${result.latencyMs ?? '?'}ms.`
          : `Could not connect: ${result.error?.message ?? 'unknown error'}`
        return [{ type: 'text', text }]
      },
    },
    async execute(rawArgs): Promise<ConnectionTestResult> {
      const args = asRecord(rawArgs, NAME)
      const id = requireString(args, 'id', NAME)
      try {
        const adapter = await ctx.dataAgent.getAdapter(id)
        return await adapter.testConnection()
      } catch (error) {
        // Opening the connection is itself part of "testing" it: a source
        // that doesn't exist or a bad host/credentials is a failed test, not
        // an infrastructure throw — the model shouldn't need to disambiguate.
        if (error instanceof DataAgentError) {
          return { ok: false, error: { code: error.code, message: error.message } }
        }
        return { ok: false, error: { code: CONNECTION_FAILED_CODE, message: (error as Error).message } }
      }
    },
  })
}
