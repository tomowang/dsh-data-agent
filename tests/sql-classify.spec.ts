import { describe, expect, it } from 'vitest'
import { assertSqlAllowed } from '../src/sql/classify.ts'

describe('assertSqlAllowed', () => {
  const engines = ['mysql', 'postgres', 'sqlite'] as const

  for (const engine of engines) {
    it(`allows a plain SELECT on a read-only ${engine} source`, () => {
      expect(() => assertSqlAllowed('SELECT * FROM orders', engine, true)).not.toThrow()
    })

    it(`allows a CTE SELECT on a read-only ${engine} source`, () => {
      expect(() =>
        assertSqlAllowed('WITH recent AS (SELECT * FROM orders) SELECT * FROM recent', engine, true),
      ).not.toThrow()
    })

    it(`rejects an INSERT on a read-only ${engine} source`, () => {
      expect(() => assertSqlAllowed('INSERT INTO orders (id) VALUES (1)', engine, true)).toThrow(/read-only/)
    })

    it(`rejects an UPDATE on a read-only ${engine} source`, () => {
      expect(() => assertSqlAllowed('UPDATE orders SET status = \'x\'', engine, true)).toThrow(/read-only/)
    })

    it(`rejects a DELETE on a read-only ${engine} source`, () => {
      expect(() => assertSqlAllowed('DELETE FROM orders', engine, true)).toThrow(/read-only/)
    })

    it(`rejects DDL (DROP TABLE) on a read-only ${engine} source`, () => {
      expect(() => assertSqlAllowed('DROP TABLE orders', engine, true)).toThrow(/read-only/)
    })

    it(`allows a write statement when readOnly is false on ${engine}`, () => {
      expect(() => assertSqlAllowed('DELETE FROM orders', engine, false)).not.toThrow()
    })

    it(`rejects statement-stacking on ${engine} even when readOnly is false`, () => {
      expect(() => assertSqlAllowed('SELECT 1; SELECT 2', engine, false)).toThrow(/one SQL statement/)
    })

    it(`rejects a trailing second statement on a read-only ${engine} source`, () => {
      expect(() => assertSqlAllowed('SELECT 1; DROP TABLE orders', engine, true)).toThrow(/one SQL statement/)
    })

    it(`rejects unparseable input on ${engine} rather than guessing`, () => {
      expect(() => assertSqlAllowed('this is not sql at all §§§', engine, true)).toThrow(/parse/)
    })
  }

  it('allows SHOW TABLES on mysql', () => {
    expect(() => assertSqlAllowed('SHOW TABLES', 'mysql', true)).not.toThrow()
  })

  it('allows EXPLAIN on mysql', () => {
    expect(() => assertSqlAllowed('EXPLAIN SELECT 1', 'mysql', true)).not.toThrow()
  })
})
