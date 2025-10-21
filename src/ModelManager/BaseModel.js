import { Model as ObjectionModel, mixin, compose } from 'objection';
const {
  OBJECTION_INSTANCE_HOOKS,
  OBJECTION_STATIC_HOOKS,
  BASEMODEL_SCHEMA_FEATURES,
  HOOK_EVENT_NAMES,
  VALID_OBJECTION_HOOKS,
} = require('./ModelConstants');

// Module-level WeakMap for plugin tracking
// This allows plugin-created classes to access plugin data without private field restrictions
const pluginStorage = new WeakMap();

/**
 * Get plugin data for a class, initializing if needed
 * @param {Function} target - The class to get plugin data for
 * @returns {Object} Plugin data object
 */
function getPluginData(target) {
  if (!pluginStorage.has(target)) {
    pluginStorage.set(target, {
      appliedPlugins: [],
      pluginMetadata: new Map(),
      pluginNames: new Set(),
    });
  }
  return pluginStorage.get(target);
}

/**
 * Get predefined public JSON preset configurations
 * @param {string} preset - Preset name
 * @returns {Object|null} Preset configuration or null
 */
function getPublicJSONPreset(preset) {
  const presets = {
    minimal: {
      include: ['id', 'name', 'title', 'slug'],
      includeTimestamps: false,
      includeSoftDeletes: false,
      includeInternal: false,
    },
    standard: {
      includeTimestamps: false,
      includeSoftDeletes: false,
      includeInternal: false,
    },
    full: {
      includeTimestamps: true,
      includeSoftDeletes: false,
      includeInternal: false,
    },
    admin: {
      includeTimestamps: true,
      includeSoftDeletes: true,
      includeInternal: true,
    },
  };

  return presets[preset] || null;
}

/**
 * Build exclusion list based on schema and options
 * @param {Object} schema - Model schema
 * @param {Object} options - Exclusion options
 * @returns {Array<string>} List of fields to exclude
 */
function buildExclusionList(schema, options) {
  const {
    additionalExclude = [],
    includeTimestamps = false,
    includeSoftDeletes = false,
    includeInternal = false,
  } = options;

  const excludeFields = [...additionalExclude];

  // Always exclude sensitive fields (configured via schema.alwaysExclude)
  if (schema.alwaysExclude && Array.isArray(schema.alwaysExclude)) {
    excludeFields.push(...schema.alwaysExclude);
  }

  // Exclude timestamp fields if not requested
  if (!includeTimestamps) {
    excludeFields.push('created_at', 'updated_at');

    // Add custom timestamp columns from schema
    if (schema.timestampColumns) {
      excludeFields.push(...Object.values(schema.timestampColumns));
    }
  }

  // Exclude soft delete fields if not requested
  if (!includeSoftDeletes) {
    excludeFields.push('deleted_at');

    // Add custom soft delete column from schema
    if (schema.softDeleteColumn) {
      excludeFields.push(schema.softDeleteColumn);
    }
  }

  // Exclude internal fields if not requested (configured via schema.internalFields)
  if (!includeInternal && schema.internalFields && Array.isArray(schema.internalFields)) {
    excludeFields.push(...schema.internalFields);
  }

  // Add schema-defined excluded fields
  if (schema.publicExclude && Array.isArray(schema.publicExclude)) {
    excludeFields.push(...schema.publicExclude);
  }

  // Remove duplicates
  return [...new Set(excludeFields)];
}

/**
 * Apply field transformations to JSON data
 * @param {Object} json - JSON object to transform
 * @param {Object} transforms - Transformation functions
 * @returns {Object} Transformed JSON object
 */
function applyFieldTransformations(json, transforms) {
  const result = { ...json };

  for (const [field, transformer] of Object.entries(transforms)) {
    try {
      if (typeof transformer === 'function') {
        // Apply transformation - can create new fields or transform existing ones
        result[field] = transformer(result[field], result);
      } else if (transformer == null) {
        // null transformer means remove the field
        delete result[field];
      }
    } catch (error) {
      // Log transformation error but don't break the response
      console.warn(`Field transformation failed for '${field}':`, error.message);
    }
  }

  return result;
}

/**
 * Enhanced BaseModel for one-way flow architecture with Objection.js plugin support
 *
 * Extends Objection.js Model with essential features needed by ModelManager:
 * - Custom schema support for ModelManager configuration
 * - Model name tracking for debugging
 * - Basic timestamping support
 * - Compatible with ModelManager's dynamic model creation
 * - Comprehensive plugin system with mixin support
 * - Plugin lifecycle management and validation
 * - Built-in plugin utilities and helpers
 */
export class BaseModel extends ObjectionModel {
  /** @type {string|null} */
  static #modelName = null;

  /** @type {Object|null} */
  static #schema = null;

  /**
   * Constructor that accepts initial data and sets properties
   * This provides convenience for test patterns: new Model({ prop: value })
   * Uses Objection's $set() internally for proper property handling
   *
   * @param {Object} [data] - Initial data to set on the instance
   */
  constructor(data) {
    super();
    if (data && typeof data === 'object') {
      this.$set(data);
    }
  }

  /**
   * Get reference to the original Objection Model class
   * Used by ConnectionManager for validation and compatibility
   *
   * @returns {Function} ObjectionModel class
   */
  static get ObjectionModel() {
    return ObjectionModel;
  }

  /**
   * Get the model name for debugging and identification
   *
   * @returns {string} Model name
   */
  static get modelName() {
    return this.#modelName || this.name;
  }

  /**
   * Set the model name (used by ModelManager)
   *
   * @param {string} name - Model name
   */
  static set modelName(name) {
    this.#modelName = name;
  }

  /**
   * Get the custom schema configuration
   *
   * This is used by ModelManager for configuration, not Objection.js validation.
   * For Objection.js validation, use the standard jsonSchema property.
   *
   * @returns {Object} Schema configuration
   */
  static get schema() {
    return this.#schema || {};
  }

  /**
   * Set the custom schema configuration
   *
   * @param {Object} schema - Schema configuration
   */
  static set schema(schema) {
    this.#schema = schema;
  }

  // ============================================================================
  // OBJECTION.JS INSTANCE HOOKS
  // ============================================================================

  /**
   * Objection.js hook: Before insert
   * Adds automatic timestamps if enabled in schema
   *
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $beforeInsert(queryContext) {
    // Always call super first for plugin compatibility
    if (super.$beforeInsert) {
      await super.$beforeInsert(queryContext);
    }

    const schema = this.constructor.schema;

    // Handle timestamps
    if (schema.timestamps) {
      const now = new Date();
      const timestampColumns = schema.timestampColumns || {};

      this[timestampColumns.createdAt || 'created_at'] = now;
      this[timestampColumns.updatedAt || 'updated_at'] = now;
    }

    // Handle UUID generation
    if (schema.generateUuid && !this.id) {
      this.id = this.constructor.#generateUuid();
    }

    // Handle auto-increment fields
    if (schema.autoFields) {
      for (const [field, generator] of Object.entries(schema.autoFields)) {
        if (!this[field] && typeof generator === 'function') {
          this[field] = generator(this, queryContext);
        }
      }
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('beforeInsert', {
      instance: this,
      context: queryContext,
    });
  }

  /**
   * Objection.js hook: After insert
   *
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $afterInsert(queryContext) {
    // Always call super first for plugin compatibility
    if (super.$afterInsert) {
      await super.$afterInsert(queryContext);
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('afterInsert', {
      instance: this,
      context: queryContext,
    });
  }

  /**
   * Objection.js hook: Before update
   * Updates the updated_at timestamp if enabled in schema
   *
   * @param {Object} opt - Update options
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $beforeUpdate(opt, queryContext) {
    // Always call super first for plugin compatibility
    if (super.$beforeUpdate) {
      await super.$beforeUpdate(opt, queryContext);
    }

    const schema = this.constructor.schema;

    // Handle timestamps
    if (schema.timestamps) {
      const timestampColumns = schema.timestampColumns || {};
      this[timestampColumns.updatedAt || 'updated_at'] = new Date();
    }

    // Handle version increment
    if (schema.versioning && this.version != null) {
      this.version = (this.version || 0) + 1;
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('beforeUpdate', {
      instance: this,
      options: opt,
      context: queryContext,
    });
  }

  /**
   * Objection.js hook: After update
   *
   * @param {Object} opt - Update options
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $afterUpdate(opt, queryContext) {
    // Always call super first for plugin compatibility
    if (super.$afterUpdate) {
      await super.$afterUpdate(opt, queryContext);
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('afterUpdate', {
      instance: this,
      options: opt,
      context: queryContext,
    });
  }

  /**
   * Objection.js hook: Before delete
   *
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $beforeDelete(queryContext) {
    // Always call super first for plugin compatibility
    if (super.$beforeDelete) {
      await super.$beforeDelete(queryContext);
    }

    const schema = this.constructor.schema;

    // Handle soft deletes
    if (schema.softDeletes) {
      const softDeleteColumn = schema.softDeleteColumn || 'deleted_at';
      this[softDeleteColumn] = new Date();

      // Convert delete to update for soft delete
      return this.$query(queryContext.transaction).patch({
        [softDeleteColumn]: this[softDeleteColumn],
      });
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('beforeDelete', {
      instance: this,
      context: queryContext,
    });
  }

  /**
   * Objection.js hook: After delete
   *
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $afterDelete(queryContext) {
    // Always call super first for plugin compatibility
    if (super.$afterDelete) {
      await super.$afterDelete(queryContext);
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('afterDelete', {
      instance: this,
      context: queryContext,
    });
  }

  /**
   * Objection.js hook: After find
   *
   * @param {Object} queryContext - Query context with transaction and custom data
   * @returns {Promise<void>} Always returns a promise
   */
  async $afterFind(queryContext) {
    // Always call super first for plugin compatibility
    if (super.$afterFind) {
      await super.$afterFind(queryContext);
    }

    // Emit hook event for monitoring
    this.constructor.#emitHookEvent('afterFind', {
      instance: this,
      context: queryContext,
    });
  }

  // ============================================================================
  // STATIC QUERY HOOKS
  // ============================================================================

  /**
   * Objection.js static hook: Before find
   *
   * @param {Object} args - Static hook arguments
   * @param {Function} args.asFindQuery - Convert to find query
   * @param {Function} args.cancelQuery - Cancel the query
   * @param {Object} args.context - Query context
   * @returns {Promise<void>|void} Can be async
   */
  static async beforeFind(args) {
    // Always call super first for plugin compatibility
    if (super.beforeFind) {
      await super.beforeFind(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('beforeFind', {
      args,
      modelClass: this,
    });
  }

  /**
   * Objection.js static hook: After find
   *
   * @param {Object} args - Static hook arguments with result
   * @returns {Promise<void>|void} Can be async
   */
  static async afterFind(args) {
    // Always call super first for plugin compatibility
    if (super.afterFind) {
      await super.afterFind(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('afterFind', {
      args,
      modelClass: this,
      result: args.result,
    });
  }

  /**
   * Objection.js static hook: Before insert
   *
   * @param {Object} args - Static hook arguments
   * @returns {Promise<void>|void} Can be async
   */
  static async beforeInsert(args) {
    // Always call super first for plugin compatibility
    if (super.beforeInsert) {
      await super.beforeInsert(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('beforeInsert', {
      args,
      modelClass: this,
    });
  }

  /**
   * Objection.js static hook: After insert
   *
   * @param {Object} args - Static hook arguments with result
   * @returns {Promise<void>|void} Can be async
   */
  static async afterInsert(args) {
    // Always call super first for plugin compatibility
    if (super.afterInsert) {
      await super.afterInsert(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('afterInsert', {
      args,
      modelClass: this,
      result: args.result,
    });
  }

  /**
   * Objection.js static hook: Before update
   *
   * @param {Object} args - Static hook arguments
   * @returns {Promise<void>|void} Can be async
   */
  static async beforeUpdate(args) {
    // Always call super first for plugin compatibility
    if (super.beforeUpdate) {
      await super.beforeUpdate(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('beforeUpdate', {
      args,
      modelClass: this,
    });
  }

  /**
   * Objection.js static hook: After update
   *
   * @param {Object} args - Static hook arguments with result
   * @returns {Promise<void>|void} Can be async
   */
  static async afterUpdate(args) {
    // Always call super first for plugin compatibility
    if (super.afterUpdate) {
      await super.afterUpdate(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('afterUpdate', {
      args,
      modelClass: this,
      result: args.result,
    });
  }

  /**
   * Objection.js static hook: Before delete
   *
   * @param {Object} args - Static hook arguments
   * @returns {Promise<void>|void} Can be async
   */
  static async beforeDelete(args) {
    // Always call super first for plugin compatibility
    if (super.beforeDelete) {
      await super.beforeDelete(args);
    }

    const schema = this.schema;

    // Handle soft deletes at query level
    if (schema.softDeletes) {
      const softDeleteColumn = schema.softDeleteColumn || 'deleted_at';

      // Convert delete to update for soft delete
      const numAffected = await args.asFindQuery().patch({
        [softDeleteColumn]: new Date(),
      });

      // Cancel the original delete query
      args.cancelQuery(numAffected);
      return;
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('beforeDelete', {
      args,
      modelClass: this,
    });
  }

  /**
   * Objection.js static hook: After delete
   *
   * @param {Object} args - Static hook arguments with result
   * @returns {Promise<void>|void} Can be async
   */
  static async afterDelete(args) {
    // Always call super first for plugin compatibility
    if (super.afterDelete) {
      await super.afterDelete(args);
    }

    // Emit hook event for monitoring
    this.#emitHookEvent('afterDelete', {
      args,
      modelClass: this,
      result: args.result,
    });
  }

  // ============================================================================
  // HOOK UTILITIES AND HELPERS
  // ============================================================================

  /**
   * Generate UUID v4
   * @private
   */
  static #generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Emit hook event for monitoring
   * @private
   */
  static #emitHookEvent(hookName, data) {
    // Only emit if there are listeners (to avoid performance impact)
    if (this.listenerCount && this.listenerCount(`hook:${hookName}`) > 0) {
      this.emit(`hook:${hookName}`, {
        hookName,
        modelName: this.modelName || this.name,
        timestamp: new Date(),
        ...data,
      });
    }
  }

  /**
   * Get information about available hooks
   *
   * @returns {Object} Hook information
   */
  static getHookInfo() {
    return {
      instanceHooks: [...OBJECTION_INSTANCE_HOOKS],
      staticHooks: [...OBJECTION_STATIC_HOOKS],
      schemaFeatures: { ...BASEMODEL_SCHEMA_FEATURES },
    };
  }

  /**
   * Create a hook listener for monitoring
   *
   * @param {string} hookName - Name of the hook to listen to
   * @param {Function} listener - Listener function
   * @returns {Function} Unsubscribe function
   *
   * @example
   * // Listen to insert events
   * const unsubscribe = User.onHook('beforeInsert', (data) => {
   *   console.log('User being created:', data.instance.name);
   * });
   *
   * // Stop listening
   * unsubscribe();
   */
  static onHook(hookName, listener) {
    const eventName = `hook:${hookName}`;
    this.on(eventName, listener);

    // Return unsubscribe function
    return () => this.off(eventName, listener);
  }

  /**
   * Create a one-time hook listener
   *
   * @param {string} hookName - Name of the hook to listen to
   * @param {Function} listener - Listener function
   * @returns {Function} Unsubscribe function
   *
   * @example
   * // Listen to next insert event only
   * User.onceHook('afterInsert', (data) => {
   *   console.log('First user created:', data.instance.id);
   * });
   */
  static onceHook(hookName, listener) {
    const eventName = `hook:${hookName}`;
    this.once(eventName, listener);

    // Return unsubscribe function (though it will auto-remove after first call)
    return () => this.off(eventName, listener);
  }

  /**
   * Get all available hook event names
   *
   * @returns {Object} Hook event names from constants
   */
  static getHookEventNames() {
    return { ...HOOK_EVENT_NAMES };
  }

  /**
   * Check if a hook name is valid
   *
   * @param {string} hookName - Hook name to validate
   * @param {string} [type='any'] - Hook type ('instance', 'static', or 'any')
   * @returns {boolean} True if hook name is valid
   */
  static isValidHook(hookName, type = 'any') {
    switch (type) {
      case 'instance':
        return OBJECTION_INSTANCE_HOOKS.includes(hookName);
      case 'static':
        return OBJECTION_STATIC_HOOKS.includes(hookName);
      case 'any':
      default:
        return VALID_OBJECTION_HOOKS.includes(hookName);
    }
  }

  /**
   * Convert model to JSON with optional field filtering
   *
   * @param {Object} [options] - Conversion options
   * @param {string[]} [options.exclude] - Fields to exclude from JSON
   * @param {string[]} [options.include] - Only include these fields in JSON
   * @returns {Object} JSON representation
   */
  $formatJson(json, options = {}) {
    const { exclude = [], include } = options;

    // If include is specified, only include those fields
    if (include && Array.isArray(include)) {
      const filtered = {};
      for (const field of include) {
        if (Object.prototype.hasOwnProperty.call(json, field)) {
          filtered[field] = json[field];
        }
      }
      return filtered;
    }

    // Exclude specified fields
    if (exclude.length > 0) {
      const filtered = { ...json };
      for (const field of exclude) {
        delete filtered[field];
      }
      return filtered;
    }

    return json;
  }

  /**
   * Get a clean representation for API responses
   * Supports multiple strategies for field filtering and transformation
   *
   * @param {Object} [options] - Public JSON options
   * @param {string[]} [options.exclude] - Additional fields to exclude
   * @param {string[]} [options.include] - Only include these fields (overrides exclude)
   * @param {Object} [options.transform] - Field transformation functions
   * @param {boolean} [options.includeTimestamps=false] - Include timestamp fields
   * @param {boolean} [options.includeSoftDeletes=false] - Include soft delete fields
   * @param {boolean} [options.includeInternal=false] - Include internal fields
   * @param {string} [options.preset] - Use predefined field preset ('minimal', 'standard', 'full')
   * @returns {Object} Clean JSON representation for API responses
   *
   * @example
   * // Basic usage
   * const publicData = user.toPublicJSON();
   *
   * // Include timestamps
   * const withTimestamps = user.toPublicJSON({ includeTimestamps: true });
   *
   * // Custom exclusions
   * const customData = user.toPublicJSON({ exclude: ['internal_notes'] });
   *
   * // Field transformations
   * const transformed = user.toPublicJSON({
   *   transform: {
   *     email: (email) => email.toLowerCase(),
   *     created_at: (date) => date.toISOString()
   *   }
   * });
   *
   * // Use preset
   * const minimal = user.toPublicJSON({ preset: 'minimal' });
   */
  toPublicJSON(options = {}) {
    const {
      exclude: additionalExclude = [],
      include,
      transform = {},
      includeTimestamps = false,
      includeSoftDeletes = false,
      includeInternal = false,
      preset,
    } = options;

    // Get base JSON data
    let json = this.toJSON();

    // Apply preset configurations
    if (preset) {
      const presetConfig = getPublicJSONPreset(preset);
      if (presetConfig) {
        return this.toPublicJSON({ ...presetConfig, ...options, preset: undefined });
      }
    }

    // Build exclusion list based on schema and options
    const excludeFields = buildExclusionList(this.constructor.schema, {
      additionalExclude,
      includeTimestamps,
      includeSoftDeletes,
      includeInternal,
    });

    // Apply field filtering
    if (Array.isArray(include)) {
      // Include only specified fields
      const filtered = {};
      for (const field of include) {
        if (Object.prototype.hasOwnProperty.call(json, field)) {
          filtered[field] = json[field];
        }
      }
      json = filtered;
    } else if (excludeFields.length > 0) {
      // Exclude specified fields
      json = { ...json };
      for (const field of excludeFields) {
        delete json[field];
      }
    }

    // Apply field transformations
    if (Object.keys(transform).length > 0) {
      json = applyFieldTransformations(json, transform);
    }

    // Apply schema-defined public transformations
    const schemaTransforms = this.constructor.schema.publicTransforms;
    if (schemaTransforms && typeof schemaTransforms === 'object') {
      json = applyFieldTransformations(json, schemaTransforms);
    }

    return json;
  }

  /**
   * Get available public JSON presets
   *
   * @returns {string[]} Available preset names
   */
  static getPublicJSONPresets() {
    return ['minimal', 'standard', 'full', 'admin'];
  }

  /**
   * Create a custom public JSON method with predefined options
   *
   * @param {Object} defaultOptions - Default options for the custom method
   * @param {Object} [config] - Configuration for method creation
   * @param {string} [config.name] - Name for the method (for debugging)
   * @param {boolean} [config.bindToPrototype] - Whether to bind to model prototype
   * @returns {Function} Custom public JSON method
   *
   * @example
   * // Method 1: Create and assign manually
   * const toAPIv1JSON = BaseModel.createPublicJSONMethod({
   *   exclude: ['internal_notes'],
   *   includeTimestamps: true,
   *   transform: {
   *     created_at: (date) => Math.floor(date.getTime() / 1000)
   *   }
   * });
   * User.prototype.toAPIv1JSON = toAPIv1JSON;
   *
   * // Method 2: Auto-bind to prototype
   * BaseModel.createPublicJSONMethod({
   *   includeTimestamps: true
   * }, { name: 'toMobileJSON', bindToPrototype: true });
   *
   * // Method 3: Use as standalone function
   * const mobileFormatter = BaseModel.createPublicJSONMethod({
   *   include: ['id', 'name', 'email']
   * });
   * const mobileData = mobileFormatter.call(user);
   */
  static createPublicJSONMethod(defaultOptions = {}, config = {}) {
    const { name, bindToPrototype = false } = config;

    // Create the method function
    const customMethod = function customPublicJSON(options = {}) {
      // Ensure we have a valid context (model instance)
      if (!this || typeof this.toPublicJSON !== 'function') {
        throw new Error(
          'Custom public JSON method must be called on a model instance. ' +
            'Use: method.call(instance) or assign to prototype.'
        );
      }
      return this.toPublicJSON({ ...defaultOptions, ...options });
    };

    // Add method name for debugging
    if (name) {
      Object.defineProperty(customMethod, 'name', {
        value: name,
        configurable: true,
      });
    }

    // Auto-bind to prototype if requested
    if (bindToPrototype && name) {
      this.prototype[name] = customMethod;
    }

    return customMethod;
  }

  /**
   * Add a custom public JSON method to the model prototype
   *
   * @param {string} methodName - Name of the method to add
   * @param {Object} defaultOptions - Default options for the method
   * @returns {Function} The created method
   *
   * @example
   * // Add method directly to User model
   * User.addPublicJSONMethod('toAPIv1JSON', {
   *   includeTimestamps: true,
   *   transform: {
   *     created_at: (date) => Math.floor(date.getTime() / 1000)
   *   }
   * });
   *
   * // Use the method
   * const user = await User.query().findById(1);
   * const apiData = user.toAPIv1JSON();
   */
  static addPublicJSONMethod(methodName, defaultOptions = {}) {
    if (!methodName || typeof methodName !== 'string') {
      throw new Error('Method name must be a non-empty string');
    }

    if (this.prototype[methodName]) {
      throw new Error(`Method '${methodName}' already exists on ${this.name} prototype`);
    }

    const method = this.createPublicJSONMethod(defaultOptions, { name: methodName });
    this.prototype[methodName] = method;

    return method;
  }

  /**
   * Create multiple public JSON methods at once
   *
   * @param {Object} methods - Object with method names as keys and options as values
   * @returns {Object} Object with created methods
   *
   * @example
   * User.createPublicJSONMethods({
   *   toAPIv1JSON: {
   *     includeTimestamps: true,
   *     transform: { created_at: (date) => Math.floor(date.getTime() / 1000) }
   *   },
   *   toMobileJSON: {
   *     include: ['id', 'name', 'email', 'profile']
   *   },
   *   toMinimalJSON: {
   *     preset: 'minimal'
   *   }
   * });
   */
  static createPublicJSONMethods(methods = {}) {
    const createdMethods = {};

    for (const [methodName, options] of Object.entries(methods)) {
      createdMethods[methodName] = this.addPublicJSONMethod(methodName, options);
    }

    return createdMethods;
  }

  /**
   * Check if the model has timestamps enabled
   *
   * @returns {boolean} True if timestamps are enabled
   */
  static get hasTimestamps() {
    return this.schema.timestamps === true;
  }

  /**
   * Check if the model has soft deletes enabled
   *
   * @returns {boolean} True if soft deletes are enabled
   */
  static get hasSoftDeletes() {
    return this.schema.softDeletes === true;
  }

  /**
   * Get the validation rules from schema
   * Supports both schema.validation and schema.validationRules for backward compatibility
   *
   * @returns {Object} Validation rules
   */
  static get validationRules() {
    return this.schema.validationRules || this.schema.validation || {};
  }

  /**
   * Generate Objection.js JSON schema from validation rules
   * This allows properties to be set via constructor: new Model({ prop: value })
   *
   * @returns {Object} Objection.js JSON schema
   */
  static get jsonSchema() {
    const rules = this.validationRules;
    if (!rules || Object.keys(rules).length === 0) {
      return {
        type: 'object',
        properties: {},
      };
    }

    const properties = {};
    const required = [];

    // Add required fields
    if (rules.required && Array.isArray(rules.required)) {
      required.push(...rules.required);
    }

    // Add type definitions
    if (rules.types) {
      for (const [field, type] of Object.entries(rules.types)) {
        properties[field] = {
          type: type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : 'string',
        };
      }
    }

    // Add length constraints
    if (rules.length) {
      for (const [field, constraints] of Object.entries(rules.length)) {
        if (!properties[field]) properties[field] = { type: 'string' };
        if (constraints.min != null) properties[field].minLength = constraints.min;
        if (constraints.max != null) properties[field].maxLength = constraints.max;
      }
    }

    // Add range constraints
    if (rules.range) {
      for (const [field, constraints] of Object.entries(rules.range)) {
        if (!properties[field]) properties[field] = { type: 'number' };
        if (constraints.min != null) properties[field].minimum = constraints.min;
        if (constraints.max != null) properties[field].maximum = constraints.max;
      }
    }

    // Add pattern constraints
    if (rules.patterns) {
      for (const [field, pattern] of Object.entries(rules.patterns)) {
        if (!properties[field]) properties[field] = { type: 'string' };
        if (pattern instanceof RegExp) {
          properties[field].pattern = pattern.source;
        } else if (typeof pattern === 'string') {
          properties[field].pattern = pattern;
        }
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required }),
    };
  }

  // ============================================================================
  // PLUGIN SYSTEM METHODS
  // ============================================================================

  /**
   * Apply a single plugin (mixin) to the model
   *
   * @param {Function} plugin - Plugin function that takes a Model class and returns extended class
   * @param {Object} [options] - Plugin configuration options
   * @param {string} [options.name] - Plugin name for tracking
   * @param {string} [options.version] - Plugin version
   * @param {Array<string>} [options.dependencies] - Required plugin dependencies
   * @returns {Function} Extended model class with plugin applied
   *
   * @example
   * const TimestampPlugin = (Model) => {
   *   return class extends Model {
   *     $beforeInsert() {
   *       super.$beforeInsert();
   *       this.created_at = new Date();
   *     }
   *   };
   * };
   *
   * const ExtendedModel = BaseModel.plugin(TimestampPlugin, {
   *   name: 'timestamps',
   *   version: '1.0.0'
   * });
   */
  static plugin(plugin, options = {}) {
    if (typeof plugin !== 'function') {
      throw new Error('Plugin must be a function (mixin)');
    }

    const pluginName = options.name || plugin.name || `plugin-${Date.now()}`;

    // Validate plugin dependencies
    if (options.dependencies) {
      this.#validatePluginDependencies(options.dependencies, pluginName);
    }

    // Check for duplicate plugins
    const currentData = getPluginData(this);
    if (currentData.pluginNames.has(pluginName)) {
      throw new Error(`Plugin '${pluginName}' is already applied to this model`);
    }

    try {
      // Apply the plugin (mixin)
      const ExtendedModel = plugin(this);

      // Validate that plugin returned a proper class
      if (typeof ExtendedModel !== 'function' || !ExtendedModel.prototype) {
        throw new Error(`Plugin '${pluginName}' must return a class`);
      }

      // Store plugin metadata
      const metadata = {
        name: pluginName,
        version: options.version || '1.0.0',
        dependencies: options.dependencies || [],
        appliedAt: new Date(),
        options: { ...options },
      };

      // Copy parent plugin data and add new plugin
      const extendedData = getPluginData(ExtendedModel);
      extendedData.appliedPlugins = [...currentData.appliedPlugins, plugin];
      extendedData.pluginMetadata = new Map(currentData.pluginMetadata);
      extendedData.pluginMetadata.set(pluginName, metadata);
      extendedData.pluginNames = new Set([...currentData.pluginNames, pluginName]);

      // Copy static properties from original model using getters/setters
      // Can't write to private fields on dynamically created classes
      if (this.#modelName) ExtendedModel.modelName = this.#modelName;
      if (this.#schema) ExtendedModel.schema = this.#schema;

      return ExtendedModel;
    } catch (error) {
      throw new Error(`Failed to apply plugin '${pluginName}': ${error.message}`);
    }
  }

  /**
   * Apply multiple plugins using Objection.js mixin helper
   *
   * @param {...(Function|Object)} plugins - Array of plugins or plugin configurations
   * @returns {Function} Extended model class with all plugins applied
   *
   * @example
   * const ExtendedModel = BaseModel.plugins(
   *   TimestampPlugin,
   *   SoftDeletePlugin,
   *   { plugin: ValidationPlugin, options: { strict: true } }
   * );
   */
  static plugins(...plugins) {
    if (plugins.length === 0) {
      return this;
    }

    // Process plugins and extract pure mixin functions
    const mixins = [];
    const pluginConfigs = [];

    for (const pluginConfig of plugins) {
      if (typeof pluginConfig === 'function') {
        // Simple plugin function
        mixins.push(pluginConfig);
        pluginConfigs.push({ plugin: pluginConfig });
      } else if (pluginConfig && typeof pluginConfig?.plugin === 'function') {
        // Plugin with options
        mixins.push(pluginConfig.plugin);
        pluginConfigs.push(pluginConfig);
      } else {
        throw new Error('Invalid plugin configuration. Must be function or { plugin, options }');
      }
    }

    // Use Objection.js mixin helper for efficient application
    const ExtendedModel = mixin(this, mixins);

    // Apply metadata for all plugins
    const currentData = getPluginData(this);
    const extendedData = getPluginData(ExtendedModel);
    extendedData.appliedPlugins = [...currentData.appliedPlugins, ...mixins];
    extendedData.pluginMetadata = new Map(currentData.pluginMetadata);
    extendedData.pluginNames = new Set(currentData.pluginNames);

    for (const config of pluginConfigs) {
      const pluginName = config.options?.name || config.plugin.name || `plugin-${Date.now()}`;

      if (extendedData.pluginNames.has(pluginName)) {
        throw new Error(`Plugin '${pluginName}' is already applied to this model`);
      }

      const metadata = {
        name: pluginName,
        version: config.options?.version || '1.0.0',
        dependencies: config.options?.dependencies || [],
        appliedAt: new Date(),
        options: config.options || {},
      };

      extendedData.pluginMetadata.set(pluginName, metadata);
      extendedData.pluginNames.add(pluginName);
    }

    // Copy static properties from original model using getters/setters
    // Can't write to private fields on dynamically created classes
    if (this.#modelName) ExtendedModel.modelName = this.#modelName;
    if (this.#schema) ExtendedModel.schema = this.#schema;

    return ExtendedModel;
  }

  /**
   * Apply plugins using Objection.js compose helper for functional composition
   *
   * @param {...Function} plugins - Plugin functions to compose
   * @returns {Function} Composed mixin function
   *
   * @example
   * const composedMixin = BaseModel.compose(
   *   TimestampPlugin,
   *   SoftDeletePlugin,
   *   ValidationPlugin
   * );
   *
   * class User extends composedMixin(BaseModel) {}
   */
  static compose(...plugins) {
    if (plugins.length === 0) {
      return Model => Model;
    }

    // Validate all plugins are functions
    for (const plugin of plugins) {
      if (typeof plugin !== 'function') {
        throw new Error('All plugins must be functions when using compose');
      }
    }

    return compose(...plugins);
  }

  /**
   * Check if a plugin is applied to this model
   *
   * @param {string|Function} plugin - Plugin name or function to check
   * @returns {boolean} True if plugin is applied
   */
  static hasPlugin(plugin) {
    const data = getPluginData(this);
    if (typeof plugin === 'string') {
      return data.pluginNames.has(plugin);
    }
    if (typeof plugin === 'function') {
      return data.appliedPlugins.includes(plugin);
    }
    return false;
  }

  /**
   * Get metadata for a specific plugin
   *
   * @param {string} pluginName - Name of the plugin
   * @returns {Object|null} Plugin metadata or null if not found
   */
  static getPluginMetadata(pluginName) {
    const data = getPluginData(this);
    return data.pluginMetadata.get(pluginName) || null;
  }

  /**
   * Get all applied plugins information
   *
   * @returns {Object} Plugin information including names, metadata, and statistics
   */
  static getPluginInfo() {
    const data = getPluginData(this);
    const plugins = Array.from(data.pluginMetadata.entries()).map(([name, metadata]) => ({
      name,
      ...metadata,
    }));

    return {
      totalPlugins: data.appliedPlugins.length,
      pluginNames: Array.from(data.pluginNames),
      plugins,
      appliedAt: plugins.map(p => p.appliedAt).sort((a, b) => a - b),
      dependencies: plugins
        .flatMap(p => p.dependencies)
        .filter((dep, index, arr) => arr.indexOf(dep) === index),
    };
  }

  /**
   * Validate plugin dependencies
   * @private
   */
  static #validatePluginDependencies(dependencies, pluginName) {
    const data = getPluginData(this);
    for (const dependency of dependencies) {
      if (!data.pluginNames.has(dependency)) {
        throw new Error(
          `Plugin '${pluginName}' requires dependency '${dependency}' which is not applied to this model`
        );
      }
    }
  }

  // ============================================================================
  // BUILT-IN PLUGIN UTILITIES
  // ============================================================================

  /**
   * Built-in timestamp plugin for automatic created_at/updated_at handling
   *
   * @param {Object} [options] - Timestamp options
   * @param {boolean} [options.createdAt=true] - Enable created_at timestamp
   * @param {boolean} [options.updatedAt=true] - Enable updated_at timestamp
   * @param {string} [options.createdAtColumn='created_at'] - Created at column name
   * @param {string} [options.updatedAtColumn='updated_at'] - Updated at column name
   * @returns {Function} Timestamp mixin
   */
  static timestampPlugin(options = {}) {
    const {
      createdAt = true,
      updatedAt = true,
      createdAtColumn = 'created_at',
      updatedAtColumn = 'updated_at',
    } = options;

    return function TimestampMixin(Model) {
      return class extends Model {
        $beforeInsert(queryContext) {
          super.$beforeInsert(queryContext);

          if (createdAt) {
            this[createdAtColumn] = new Date();
          }
          if (updatedAt) {
            this[updatedAtColumn] = new Date();
          }
        }

        $beforeUpdate(opt, queryContext) {
          super.$beforeUpdate(opt, queryContext);

          if (updatedAt) {
            this[updatedAtColumn] = new Date();
          }
        }
      };
    };
  }

  /**
   * Built-in soft delete plugin for logical deletion
   *
   * @param {Object} [options] - Soft delete options
   * @param {string} [options.deletedAtColumn='deleted_at'] - Deleted at column name
   * @param {boolean} [options.includeDeleted=false] - Include deleted records by default
   * @returns {Function} Soft delete mixin
   */
  static softDeletePlugin(options = {}) {
    const { deletedAtColumn = 'deleted_at', includeDeleted = false } = options;

    return function SoftDeleteMixin(Model) {
      return class extends Model {
        static get softDeleteColumn() {
          return deletedAtColumn;
        }

        static query() {
          const query = super.query();

          if (!includeDeleted) {
            query.whereNull(deletedAtColumn);
          }

          return query;
        }

        $beforeDelete() {
          // Override delete to perform soft delete
          this[deletedAtColumn] = new Date();
          return this.$query().patch({ [deletedAtColumn]: this[deletedAtColumn] });
        }

        restore() {
          this[deletedAtColumn] = null;
          return this.$query().patch({ [deletedAtColumn]: null });
        }

        forceDelete() {
          return super.$query().delete();
        }

        get isDeleted() {
          return this[deletedAtColumn] != null;
        }
      };
    };
  }

  /**
   * Built-in validation plugin for enhanced field validation
   *
   * @param {Object} [options] - Validation options
   * @param {boolean} [options.strict=true] - Strict validation mode
   * @param {boolean} [options.skipOnUpdate=false] - Skip validation on updates
   * @returns {Function} Validation mixin
   */
  static validationPlugin(options = {}) {
    const { strict = true, skipOnUpdate = false } = options;

    return function ValidationMixin(Model) {
      return class extends Model {
        $beforeInsert(queryContext) {
          super.$beforeInsert(queryContext);
          this.#performValidation('insert');
        }

        $beforeUpdate(opt, queryContext) {
          super.$beforeUpdate(opt, queryContext);

          if (!skipOnUpdate) {
            this.#performValidation('update');
          }
        }

        #performValidation(operation) {
          const errors = this.$validate();

          if (errors.length > 0) {
            if (strict) {
              const errorMessages = errors.map(err => err.message);
              const error = new Error(
                `Validation failed during ${operation}: ${errorMessages.join(', ')}`
              );
              error.type = 'ValidationError';
              error.data = errors;
              error.operation = operation;
              throw error;
            } else {
              // Emit warning for non-strict mode
              console.warn(`Validation warnings during ${operation}:`, errors);
            }
          }
        }
      };
    };
  }

  /**
   * Enhanced validation based on schema rules
   * Supports required fields, types, length constraints, and custom validators
   *
   * @returns {Array<Object>} Array of validation error objects with detailed context
   */
  $validate() {
    const errors = [];
    const rules = this.constructor.validationRules;

    // Validate using helper methods to reduce complexity
    this.#validateRequiredFields(rules, errors);
    this.#validateFieldTypes(rules, errors);
    this.#validateStringLength(rules, errors);
    this.#validateNumericRange(rules, errors);
    this.#validatePatterns(rules, errors);
    this.#validateCustomRules(rules, errors);

    return errors;
  }

  /**
   * Validate required fields
   * @private
   */
  #validateRequiredFields(rules, errors) {
    if (rules.required && Array.isArray(rules.required)) {
      for (const field of rules.required) {
        const value = this[field];
        if (value == null || value === '') {
          errors.push({
            field,
            rule: 'required',
            message: `${field} is required`,
            value,
          });
        }
      }
    }
  }

  /**
   * Validate field types
   * @private
   */
  #validateFieldTypes(rules, errors) {
    if (rules.types) {
      for (const [field, expectedType] of Object.entries(rules.types)) {
        if (this[field] != null) {
          const actualType = typeof this[field];
          if (actualType !== expectedType) {
            errors.push({
              field,
              rule: 'type',
              message: `${field} must be of type ${expectedType}, got ${actualType}`,
              expected: expectedType,
              actual: actualType,
              value: this[field],
            });
          }
        }
      }
    }
  }

  /**
   * Validate string length constraints
   * @private
   */
  #validateStringLength(rules, errors) {
    if (rules.length) {
      for (const [field, constraints] of Object.entries(rules.length)) {
        const value = this[field];
        if (value != null && typeof value === 'string') {
          const { min, max } = constraints;

          if (min != null && value.length < min) {
            errors.push({
              field,
              rule: 'length',
              message: `${field} must be at least ${min} characters long`,
              minLength: min,
              actualLength: value.length,
              value,
            });
          }

          if (max != null && value.length > max) {
            errors.push({
              field,
              rule: 'length',
              message: `${field} must be no more than ${max} characters long`,
              maxLength: max,
              actualLength: value.length,
              value,
            });
          }
        }
      }
    }
  }

  /**
   * Validate numeric range constraints
   * @private
   */
  #validateNumericRange(rules, errors) {
    if (rules.range) {
      for (const [field, constraints] of Object.entries(rules.range)) {
        const value = this[field];
        if (value != null && typeof value === 'number') {
          const { min, max } = constraints;

          if (min != null && value < min) {
            errors.push({
              field,
              rule: 'range',
              message: `${field} must be at least ${min}`,
              minValue: min,
              actualValue: value,
              value,
            });
          }

          if (max != null && value > max) {
            errors.push({
              field,
              rule: 'range',
              message: `${field} must be no more than ${max}`,
              maxValue: max,
              actualValue: value,
              value,
            });
          }
        }
      }
    }
  }

  /**
   * Validate regex pattern string for security
   * @private
   * @param {string} pattern - Pattern string to validate
   * @throws {Error} If pattern is potentially dangerous
   */
  #validateRegexPattern(pattern) {
    // Check for basic safety - reject patterns that could cause ReDoS
    if (typeof pattern !== 'string') {
      throw new Error('Pattern must be a string');
    }

    // Check for empty pattern
    if (pattern.length === 0) {
      throw new Error('Pattern cannot be empty');
    }

    // Check for excessively long patterns (potential DoS)
    if (pattern.length > 1000) {
      throw new Error('Pattern too long (max 1000 characters)');
    }

    // Check for potentially dangerous patterns that could cause ReDoS
    const dangerousPatterns = [
      /\(\?.*\)\*/, // Nested quantifiers like (?:a+)+
      /\(\?.*\)\+/, // Nested quantifiers like (?:a*)+
      /\*\+/, // Consecutive quantifiers like *+
      /\+\*/, // Consecutive quantifiers like +*
      /\{\d+,\}\*/, // Quantifier followed by * like {1,}*
      /\{\d+,\}\+/, // Quantifier followed by + like {1,}+
    ];

    for (const dangerousPattern of dangerousPatterns) {
      if (dangerousPattern.test(pattern)) {
        throw new Error('Pattern contains potentially dangerous constructs that could cause ReDoS');
      }
    }
  }

  /**
   * Validate pattern matching
   * @private
   */
  #validatePatterns(rules, errors) {
    if (rules.patterns) {
      for (const [field, pattern] of Object.entries(rules.patterns)) {
        const value = this[field];
        if (value != null && typeof value === 'string') {
          let regex;
          try {
            // Handle RegExp objects directly
            if (pattern instanceof RegExp) {
              regex = pattern;
            } else if (typeof pattern === 'string') {
              // Validate pattern string before creating RegExp
              this.#validateRegexPattern(pattern);
              // eslint-disable-next-line security/detect-non-literal-regexp
              regex = new RegExp(pattern);
            } else {
              throw new Error('Pattern must be a string or RegExp object');
            }
          } catch (regexError) {
            errors.push({
              field,
              rule: 'pattern',
              message: `Invalid pattern for ${field}: ${regexError.message}`,
              value,
            });
            continue;
          }

          if (!regex.test(value)) {
            errors.push({
              field,
              rule: 'pattern',
              message: `${field} does not match the required pattern`,
              pattern: pattern.toString(),
              value,
            });
          }
        }
      }
    }
  }

  /**
   * Validate custom rules
   * @private
   */
  #validateCustomRules(rules, errors) {
    if (rules.custom) {
      for (const [field, validator] of Object.entries(rules.custom)) {
        if (typeof validator === 'function') {
          try {
            const result = validator(this[field], this);
            if (result !== true) {
              errors.push({
                field,
                rule: 'custom',
                message: typeof result === 'string' ? result : `${field} failed custom validation`,
                value: this[field],
              });
            }
          } catch (error) {
            errors.push({
              field,
              rule: 'custom',
              message: `Custom validation error for ${field}: ${error.message}`,
              error: error.message,
              value: this[field],
            });
          }
        }
      }
    }
  }

  /**
   * Override Objection.js $beforeValidate to run our enhanced custom validation
   *
   * @param {Object} _jsonSchema - Objection.js JSON schema (unused in our implementation)
   * @param {Object} _json - JSON data being validated (unused in our implementation)
   * @param {Object} _opt - Validation options (unused in our implementation)
   */
  $beforeValidate(_jsonSchema, _json, _opt) {
    const errors = this.$validate();

    if (errors.length > 0) {
      // Create user-friendly error message from detailed error objects
      const errorMessages = errors.map(err => err.message);
      const error = new Error(`Validation failed: ${errorMessages.join(', ')}`);
      error.type = 'ValidationError';
      error.data = errors; // Keep detailed error objects for debugging
      error.fields = errors.map(err => err.field); // Quick field access
      throw error;
    }
  }
}
