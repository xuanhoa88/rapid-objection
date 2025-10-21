/**
 * Constants and shared definitions for ModelManager components
 */

/**
 * Valid Objection.js instance lifecycle hooks
 *
 * These are the official instance hooks supported by Objection.js.
 * Instance hooks are called on model instances during CRUD operations.
 *
 * @see https://vincit.github.io/objection.js/guide/hooks.html#instance-query-hooks
 */
export const OBJECTION_INSTANCE_HOOKS = [
  // Lifecycle hooks
  '$beforeInsert',
  '$afterInsert',
  '$beforeUpdate',
  '$afterUpdate',
  '$beforeDelete',
  '$afterDelete',
  '$afterFind',

  // Validation hooks
  '$beforeValidate',
  '$afterValidate',

  // JSON conversion hooks
  '$formatJson',
  '$parseJson',
  '$formatDatabaseJson',
  '$parseDatabaseJson',
];

/**
 * Valid Objection.js static query hooks
 *
 * These are the official static hooks supported by Objection.js.
 * Static hooks are called once per query, regardless of the number of affected rows.
 *
 * @see https://vincit.github.io/objection.js/guide/hooks.html#static-query-hooks
 */
export const OBJECTION_STATIC_HOOKS = [
  'beforeFind',
  'afterFind',
  'beforeInsert',
  'afterInsert',
  'beforeUpdate',
  'afterUpdate',
  'beforeDelete',
  'afterDelete',
];

/**
 * All valid Objection.js lifecycle hooks (instance + static)
 *
 * Combined list of all official lifecycle hooks supported by Objection.js.
 * Used for comprehensive validation and documentation.
 *
 * @see https://vincit.github.io/objection.js/guide/hooks.html
 */
export const VALID_OBJECTION_HOOKS = [...OBJECTION_INSTANCE_HOOKS, ...OBJECTION_STATIC_HOOKS];

/**
 * Schema-driven features supported by BaseModel
 *
 * These features can be enabled in the model schema to provide
 * automatic behavior through the hook system.
 */
export const BASEMODEL_SCHEMA_FEATURES = {
  timestamps: 'Automatic created_at/updated_at handling',
  softDeletes: 'Logical deletion with deleted_at column',
  generateUuid: 'Automatic UUID generation for id field',
  versioning: 'Automatic version increment on updates',
  autoFields: 'Custom field auto-generation',
};

/**
 * Hook event names for monitoring
 *
 * These are the event names emitted by BaseModel hooks for monitoring purposes.
 */
export const HOOK_EVENT_NAMES = {
  // Instance hook events
  BEFORE_INSERT: 'hook:beforeInsert',
  AFTER_INSERT: 'hook:afterInsert',
  BEFORE_UPDATE: 'hook:beforeUpdate',
  AFTER_UPDATE: 'hook:afterUpdate',
  BEFORE_DELETE: 'hook:beforeDelete',
  AFTER_DELETE: 'hook:afterDelete',
  AFTER_FIND: 'hook:afterFind',

  // Static hook events (same names, different context)
  BEFORE_FIND: 'hook:beforeFind',
};

/**
 * Valid Objection.js relation types
 *
 * These are the official relation types supported by Objection.js.
 * Used for validation of model relation definitions.
 *
 * @see https://vincit.github.io/objection.js/guide/relations.html
 */
export const VALID_RELATION_TYPES = [
  'HasOneRelation',
  'BelongsToOneRelation',
  'HasManyRelation',
  'ManyToManyRelation',
  'HasOneThroughRelation',
];

/**
 * Reserved SQL keywords that should not be used as table names
 *
 * Basic list of common SQL reserved keywords to prevent conflicts.
 * This is not exhaustive but covers the most common cases.
 */
export const RESERVED_SQL_KEYWORDS = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'FROM',
  'WHERE',
  'JOIN',
  'ORDER',
  'GROUP',
  'HAVING',
  'UNION',
  'CREATE',
  'DROP',
  'ALTER',
  'INDEX',
  'TABLE',
  'DATABASE',
  'SCHEMA',
  'USER',
  'ROLE',
  'GRANT',
  'REVOKE',
  'COMMIT',
  'ROLLBACK',
  'TRANSACTION',
  'BEGIN',
  'END',
  'IF',
  'ELSE',
  'CASE',
  'WHEN',
  'THEN',
  'NULL',
  'NOT',
  'AND',
  'OR',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'IS',
  'AS',
  'ON',
  'INNER',
  'LEFT',
  'RIGHT',
  'OUTER',
  'FULL',
  'CROSS',
  'NATURAL',
  'USING',
];
