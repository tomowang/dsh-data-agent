import { describe, expect, it } from 'vitest'
import { assertSqlAllowed } from '../src/sql/classify.ts'

describe('assertSqlAllowed', () => {
  const engines = ['mysql', 'postgres', 'sqlite', 'clickhouse'] as const

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

  describe('read-only escapes that parse as a plain SELECT', () => {
    it('rejects SELECT ... INTO a new table on postgres', () => {
      expect(() => assertSqlAllowed('SELECT * INTO newtab FROM orders', 'postgres', true)).toThrow(/INTO/)
    })

    it('rejects SELECT ... INTO OUTFILE on mysql', () => {
      expect(() => assertSqlAllowed('SELECT * FROM orders INTO OUTFILE \'/tmp/x\'', 'mysql', true)).toThrow(/INTO/)
    })

    it('rejects SELECT ... INTO inside a subquery', () => {
      expect(() =>
        assertSqlAllowed('SELECT * FROM (SELECT * FROM orders INTO OUTFILE \'/tmp/x\') t', 'mysql', true),
      ).toThrow()
    })

    it('rejects MySQL executable comments, whose contents the parser never sees', () => {
      expect(() => assertSqlAllowed('SELECT 1 /*! INTO OUTFILE \'/tmp/y\' */', 'mysql', true)).toThrow(/executable comments/)
      expect(() => assertSqlAllowed('SELECT 1 /*M!100000 INTO OUTFILE \'/tmp/y\' */', 'mysql', true)).toThrow()
    })

    it('still allows plain comments on mysql', () => {
      expect(() => assertSqlAllowed('SELECT 1 /* note */', 'mysql', true)).not.toThrow()
    })

    it('rejects external-access ClickHouse table functions, including nested ones', () => {
      expect(() => assertSqlAllowed('SELECT * FROM url(\'http://169.254.169.254/\', CSV)', 'clickhouse', true)).toThrow(/url/)
      expect(() => assertSqlAllowed('SELECT * FROM (SELECT * FROM file(\'/etc/passwd\')) x', 'clickhouse', true)).toThrow(/file/)
      expect(() =>
        assertSqlAllowed('SELECT * FROM orders o JOIN postgresql(\'h:5432\', \'db\', \'t\', \'u\', \'p\') p ON 1 = 1', 'clickhouse', true),
      ).toThrow(/postgresql/)
    })

    it('allows local data-generating ClickHouse table functions', () => {
      expect(() => assertSqlAllowed('SELECT * FROM numbers(10)', 'clickhouse', true)).not.toThrow()
    })

    it('does not apply these checks to a read-write source', () => {
      expect(() => assertSqlAllowed('SELECT * INTO newtab FROM orders', 'postgres', false)).not.toThrow()
      expect(() => assertSqlAllowed('SELECT * FROM url(\'http://x\', CSV)', 'clickhouse', false)).not.toThrow()
    })
  })

  describe('SQLite file access', () => {
    for (const readOnly of [true, false]) {
      const mode = readOnly ? 'read-only' : 'read-write'

      it(`rejects ATTACH DATABASE on a ${mode} source`, () => {
        expect(() => assertSqlAllowed('ATTACH DATABASE \'/tmp/x.db\' AS x', 'sqlite', readOnly)).toThrow(/ATTACH and VACUUM INTO/)
      })

      it(`rejects ATTACH behind leading comments on a ${mode} source`, () => {
        expect(() =>
          assertSqlAllowed('-- note\n/* block */ attach database \'/tmp/x.db\' as x', 'sqlite', readOnly),
        ).toThrow(/ATTACH and VACUUM INTO/)
      })

      it(`rejects the forms the parser can't read on a ${mode} source`, () => {
        expect(() => assertSqlAllowed('ATTACH \'/tmp/x.db\' AS x', 'sqlite', readOnly)).toThrow()
        expect(() => assertSqlAllowed('VACUUM INTO \'/tmp/x.db\'', 'sqlite', readOnly)).toThrow()
        expect(() => assertSqlAllowed('VACUUM main INTO \'/tmp/x.db\'', 'sqlite', readOnly)).toThrow()
      })
    }

    it('allows the words inside ordinary statements', () => {
      expect(() => assertSqlAllowed('SELECT * FROM orders WHERE note = \'attach\'', 'sqlite', true)).not.toThrow()
      expect(() => assertSqlAllowed('UPDATE orders SET note = \'vacuum into\'', 'sqlite', false)).not.toThrow()
    })
  })

  describe('functions that escape read-only mode', () => {
    const denied = [
      ['postgres', "SELECT dblink_exec('dbname=x', 'DELETE FROM t')", 'dblink_exec'],
      ['postgres', "SELECT public.dblink_exec('x', 'y')", 'dblink_exec'],
      ['postgres', "SELECT pg_read_file('/etc/passwd')", 'pg_read_file'],
      ['postgres', "SELECT pg_ls_dir('.')", 'pg_ls_dir'],
      ['postgres', 'SELECT pg_advisory_lock(1)', 'pg_advisory_lock'],
      ['postgres', 'SELECT pg_try_advisory_lock_shared(1)', 'pg_try_advisory_lock_shared'],
      ['postgres', "SELECT id FROM t WHERE id IN (SELECT lo_export(1, '/tmp/x'))", 'lo_export'],
      ['mysql', "SELECT LOAD_FILE('/etc/passwd')", 'load_file'],
      ['mysql', "SELECT `load_file`('/etc/passwd')", 'load_file'],
      ['mysql', "SELECT GET_LOCK('a', 1)", 'get_lock'],
      ['clickhouse', "SELECT file('data.csv')", 'file'],
      ['sqlite', "SELECT load_extension('x')", 'load_extension'],
    ] as const

    for (const [engine, sql, name] of denied) {
      it(`rejects ${name} on a read-only ${engine} source: ${sql}`, () => {
        expect(() => assertSqlAllowed(sql, engine, true)).toThrow(new RegExp(`function "${name}"`))
      })

      it(`allows ${name} on a read-write ${engine} source: ${sql}`, () => {
        expect(() => assertSqlAllowed(sql, engine, false)).not.toThrow()
      })
    }

    it('allows ordinary and transaction-scoped functions', () => {
      expect(() => assertSqlAllowed('SELECT lower(name), count(*) FROM orders GROUP BY 1', 'postgres', true)).not.toThrow()
      expect(() => assertSqlAllowed('SELECT pg_advisory_xact_lock(1)', 'postgres', true)).not.toThrow()
      expect(() => assertSqlAllowed('SELECT pg_advisory_unlock(1)', 'postgres', true)).not.toThrow()
      expect(() => assertSqlAllowed('SELECT profile FROM users', 'clickhouse', true)).not.toThrow()
    })
  })
})
