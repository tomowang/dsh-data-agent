import * as React from 'react'
import Clickhouse from '@thesvg/react/clickhouse'
import Mysql from '@thesvg/react/mysql'
import Postgresql from '@thesvg/react/postgresql'
import Sqlite from '@thesvg/react/sqlite'
import type { Engine } from '../../data-source/types.ts'

/**
 * Brand mark for a database engine (`@thesvg/react`), one variant picked per
 * engine for legibility at small sizes: MySQL renders its `wordmark` (its
 * `default` dolphin-only mark reads as a blank blob at 16px), PostgreSQL,
 * SQLite, and ClickHouse render their `default` full-color logo. Only
 * `height` is set — these variants aren't all square (the MySQL wordmark and
 * SQLite mark are both wider than tall), so `width` is left to scale from
 * each SVG's own `viewBox` aspect ratio instead of being forced to `size`
 * and distorted.
 */
export function EngineIcon({ engine, size = 16, className, title }: {
  engine: Engine
  size?: number
  className?: string
  title?: string
}): React.ReactElement {
  const props = { height: size, className, role: 'img' as const, 'aria-label': title }
  switch (engine) {
    case 'mysql': return <Mysql variant="wordmark" {...props} />
    case 'postgres': return <Postgresql variant="default" {...props} />
    case 'sqlite': return <Sqlite variant="default" {...props} />
    case 'clickhouse': return <Clickhouse variant="default" {...props} />
  }
}
