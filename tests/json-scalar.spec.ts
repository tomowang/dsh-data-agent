import { describe, expect, it } from 'vitest'
import { toJsonScalar } from '../src/data-source/adapters/adapter.ts'

describe('toJsonScalar', () => {
  it('passes scalars through and stringifies bigint, Date, and binary cells', () => {
    expect(toJsonScalar(null)).toBe(null)
    expect(toJsonScalar(undefined)).toBe(null)
    expect(toJsonScalar('a')).toBe('a')
    expect(toJsonScalar(1.5)).toBe(1.5)
    expect(toJsonScalar(true)).toBe(true)
    expect(toJsonScalar(10n ** 20n)).toBe('100000000000000000000')
    expect(toJsonScalar(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01T00:00:00.000Z')
    expect(toJsonScalar(Buffer.from('hi'))).toBe('aGk=')
  })

  it('re-serializes an already-parsed JSON column instead of flattening it to "[object Object]"', () => {
    expect(toJsonScalar({ n: 2, tags: ['a'] })).toBe('{"n":2,"tags":["a"]}')
    expect(toJsonScalar([1, { big: 10n }])).toBe('[1,{"big":"10"}]')
  })
})
