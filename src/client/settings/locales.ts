/**
 * Locale bundle for the settings section (nav-labeled and titled "Data
 * Agent"): the nav label, the panel chrome (`DataSourcesPanel.tsx` — whose
 * body still covers data sources specifically, under its own "Data Sources"
 * subsection heading), and the `ENGINE_FORM_SCHEMAS` engine/field/SSL-mode-
 * option labels (data-source-form-schema.ts).
 */

/** Locale keys this section's nav registration and panel render. */
export type DataSourcesSettingsLocaleKey =
  | 'nav' | 'title' | 'dataSourcesSectionTitle' | 'intro' | 'loading' | 'empty'
  | 'engineSqlite' | 'engineMysql' | 'enginePostgres' | 'engineClickhouse'
  | 'fieldFilePath' | 'fieldHost' | 'fieldPort' | 'fieldUser' | 'fieldPasswordEnv'
  | 'fieldDatabase' | 'fieldSsl' | 'fieldSslMode' | 'fieldCaCertPath'
  | 'fieldEngine' | 'fieldName' | 'fieldDescription'
  | 'sslModeDisable' | 'sslModeAllow' | 'sslModePrefer'
  | 'sslModeRequire' | 'sslModeVerifyCa' | 'sslModeVerifyFull'
  | 'addDataSource' | 'newDataSource' | 'editSourceTitle'
  | 'readOnly' | 'readOnlyFor' | 'readWrite'
  | 'cancel' | 'add' | 'adding' | 'save' | 'saving'
  | 'edit' | 'remove' | 'test' | 'testing' | 'viewSchema' | 'hideSchema'
  | 'connectedIn' | 'failed' | 'optional' | 'viewOnGithub'

/** English copy. */
export const en: Record<DataSourcesSettingsLocaleKey, string> = {
  nav: 'Data Agent',
  title: 'Data Agent',
  dataSourcesSectionTitle: 'Data Sources',
  intro: 'Register database connections for chat tools to query.',
  loading: 'Loading…',
  empty: 'No data sources registered yet.',
  engineSqlite: 'SQLite',
  engineMysql: 'MySQL',
  enginePostgres: 'PostgreSQL',
  engineClickhouse: 'ClickHouse',
  fieldFilePath: 'File path',
  fieldHost: 'Host',
  fieldPort: 'Port',
  fieldUser: 'User',
  fieldPasswordEnv: 'Password env var',
  fieldDatabase: 'Database',
  fieldSsl: 'SSL',
  fieldSslMode: 'SSL mode',
  fieldCaCertPath: 'CA certificate path',
  fieldEngine: 'Engine',
  fieldName: 'Name',
  fieldDescription: 'Description',
  sslModeDisable: 'Disable',
  sslModeAllow: 'Allow',
  sslModePrefer: 'Prefer',
  sslModeRequire: 'Require',
  sslModeVerifyCa: 'Verify CA',
  sslModeVerifyFull: 'Verify Full',
  addDataSource: 'Add data source',
  newDataSource: 'New data source',
  editSourceTitle: 'Edit {name}',
  readOnly: 'Read-only',
  readOnlyFor: 'Read-only for {name}',
  readWrite: 'read-write',
  cancel: 'Cancel',
  add: 'Add',
  adding: 'Adding…',
  save: 'Save',
  saving: 'Saving…',
  edit: 'Edit',
  remove: 'Remove',
  test: 'Test',
  testing: 'Testing…',
  viewSchema: 'View schema',
  hideSchema: 'Hide schema',
  connectedIn: 'Connected in {ms}ms.',
  failed: 'Failed: {message}',
  optional: 'Optional',
  viewOnGithub: 'View on GitHub',
}

/** Simplified Chinese copy. */
export const zh: Record<DataSourcesSettingsLocaleKey, string> = {
  nav: '数据智能体',
  title: '数据智能体',
  dataSourcesSectionTitle: '数据源',
  intro: '为聊天工具注册数据库连接以供查询。',
  loading: '加载中…',
  empty: '尚未注册任何数据源。',
  engineSqlite: 'SQLite',
  engineMysql: 'MySQL',
  enginePostgres: 'PostgreSQL',
  engineClickhouse: 'ClickHouse',
  fieldFilePath: '文件路径',
  fieldHost: '服务器',
  fieldPort: '端口',
  fieldUser: '用户',
  fieldPasswordEnv: '密码环境变量',
  fieldDatabase: '数据库',
  fieldSsl: 'SSL',
  fieldSslMode: 'SSL 模式',
  fieldCaCertPath: 'CA 证书路径',
  fieldEngine: '数据库类型',
  fieldName: '名称',
  fieldDescription: '描述',
  sslModeDisable: 'Disable',
  sslModeAllow: 'Allow',
  sslModePrefer: 'Prefer',
  sslModeRequire: 'Require',
  sslModeVerifyCa: 'Verify CA',
  sslModeVerifyFull: 'Verify Full',
  addDataSource: '添加数据源',
  newDataSource: '新建数据源',
  editSourceTitle: '编辑 {name}',
  readOnly: '只读',
  readOnlyFor: '{name} 的只读开关',
  readWrite: '可读写',
  cancel: '取消',
  add: '添加',
  adding: '添加中…',
  save: '保存',
  saving: '保存中…',
  edit: '编辑',
  remove: '删除',
  test: '测试',
  testing: '测试中…',
  viewSchema: '查看表结构',
  hideSchema: '隐藏表结构',
  connectedIn: '已连接，用时 {ms}ms。',
  failed: '失败：{message}',
  optional: '可选',
  viewOnGithub: '在 GitHub 上查看',
}
