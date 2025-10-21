import { EventEmitter } from 'events';
import { mergeConfig } from '../ConfigurationManager';
import { InputValidator } from '../InputValidator';
import { BaseModel } from './BaseModel';
import { ModelValidator } from './ModelValidator';
import { VALID_OBJECTION_HOOKS } from './ModelConstants';
import { overrideComponents } from '../overrideComponents';

// Default component classes registry for ModelManager
const COMPONENT_CLASSES = {
  BaseModel,
  ModelValidator,
};

/**
 * Manages Objection.js models for a single database connection in one-way flow architecture.
 * Serves exactly one ConnectionManager and provides isolated model operations.
 * Designed for connection-specific model management with proper Knex integration.
 */
export class ModelManager extends EventEmitter {
  /** @type {boolean} */
  #initialized = false;

  /** @type {string} */
  #connectionName = null;

  /** @type {Object} */
  #config = null;

  /** @type {Map<string, Function>} */
  #registeredModels = new Map();

  /** @type {Object|null} */
  #knexInstance = null;

  /** @type {Date|null} */
  #lastModelRegistration = null;

  /** @type {ModelValidator} */
  #validator = null;

  /**
   * Create ModelManager for a single connection
   *
   * @param {Object} [config={}] - ModelManager configuration
   * @param {boolean} [config.enabled=true] - Whether ModelManager is enabled
   * @param {boolean} [config.bindKnex=true] - Automatically bind Knex to models
   * @param {boolean} [config.validateModels=true] - Validate model definitions
   * @param {Object} [config.defaultModelOptions={}] - Default options for all models
   * @param {string} [connectionName='default'] - Name of the connection this manager serves
   */
  constructor(config = {}, connectionName = 'default') {
    super();

    this.#connectionName = connectionName;
    this.#config = mergeConfig(
      {
        enabled: true,
        bindKnex: true,
        validateModels: true,
        defaultModelOptions: {},
      },
      config
    );
  }

  /**
   * Ensure manager is initialized
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('ModelManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if ModelManager is initialized
   *
   * @returns {boolean} True if initialized
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Initialize ModelManager (for consistency with other managers)
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    // Check if already initialized
    if (this.#initialized) {
      this.#emitWarning('initialize', 'ModelManager already initialized');
      return;
    }

    this.#initialized = true;

    // Initialize validator using overridden component
    this.#validator = new COMPONENT_CLASSES.ModelValidator();

    // Emit initialization event
    this.emit('initialized', {
      connectionName: this.#connectionName,
      timestamp: new Date(),
    });
  }

  /**
   * Register a single model with the connection's Knex instance
   * Supports both model definition objects and pre-defined model classes
   *
   * @param {string} modelName - Name of the model
   * @param {Object|Function} modelDefinition - Model definition object OR pre-defined model class
   * @param {string} [modelDefinition.tableName] - Database table name (for definition objects)
   * @param {Object} [modelDefinition.schema] - Model schema definition (for definition objects)
   * @param {Object} [modelDefinition.relations] - Model relations definition (for definition objects)
   * @param {Object} [modelDefinition.hooks] - Model lifecycle hooks (for definition objects)
   * @param {Object} knexInstance - Knex database connection instance
   * @param {Function} [CustomBaseModel] - Custom BaseModel class to extend from (for definition objects)
   * @returns {Promise<Function>} The registered model class
   * @throws {Error} When model registration fails
   */
  async registerModel(modelName, modelDefinition, knexInstance, CustomBaseModel = null) {
    this.#ensureInitialized();

    if (!this.#config.enabled) {
      throw new Error('ModelManager is disabled');
    }

    // Validate inputs
    if (typeof modelName !== 'string' || modelName.trim().length === 0) {
      throw new Error('Model name must be a non-empty string');
    }

    if (!modelDefinition) {
      throw new Error('Model definition or model class is required');
    }

    if (!InputValidator.isValidKnexInstance(knexInstance)) {
      throw new Error('Valid Knex instance is required');
    }

    // Detect if modelDefinition is a class (function) or definition object
    const isModelClass = typeof modelDefinition === 'function';

    let ModelClass;
    let tableName;
    let registrationType;

    if (isModelClass) {
      // Handle pre-defined model class registration
      registrationType = 'class';
      ModelClass = modelDefinition;
      tableName = ModelClass.tableName || 'unknown';

      // Validate model class structure if validation is enabled
      if (this.#config.validateModels) {
        this.#validator.validateModelStructure(modelName, ModelClass);
      }
    } else {
      // Handle model definition object registration (existing behavior)
      registrationType = 'definition';

      if (typeof modelDefinition !== 'object') {
        throw new Error('Model definition must be an object or a model class function');
      }

      if (!modelDefinition.tableName) {
        throw new Error('Model definition must include tableName');
      }

      tableName = modelDefinition.tableName;

      // Perform comprehensive model validation if enabled
      if (this.#config.validateModels) {
        this.#validator.validateModelDefinition(modelName, modelDefinition);
      }

      // Create dynamic model class from definition using overridden BaseModel
      ModelClass = this.#createDynamicModelClass(
        modelName,
        modelDefinition,
        CustomBaseModel || COMPONENT_CLASSES.BaseModel
      );
    }

    // Check if model already registered
    if (this.#registeredModels.has(modelName)) {
      this.#emitWarning('register-model', `Model '${modelName}' already registered, replacing`);
    }

    try {
      // Store Knex instance for binding
      this.#knexInstance = knexInstance;

      // Bind Knex instance to model if enabled
      if (this.#config.bindKnex) {
        ModelClass.knex(knexInstance);
      }

      // Store registered model
      this.#registeredModels.set(modelName, ModelClass);
      this.#lastModelRegistration = new Date();

      // Emit success event
      this.emit('model-registered', {
        modelName,
        tableName,
        connectionName: this.#connectionName,
        totalModels: this.#registeredModels.size,
        timestamp: new Date(),
        registrationType, // 'class' or 'definition'
      });

      return ModelClass;
    } catch (error) {
      this.#emitError(
        'register-model',
        `Failed to register model '${modelName}': ${error.message}`,
        error
      );
      throw error;
    }
  }

  /**
   * Register multiple models at once
   * Supports both model definition objects and pre-defined model classes
   *
   * @param {Object} modelDefinitions - Object mapping model names to definitions or model classes
   * @param {Object} knexInstance - Knex database connection instance
   * @param {Function} [CustomBaseModel] - Custom BaseModel class to extend from (for definition objects)
   * @returns {Promise<Object>} Object mapping model names to registered model classes
   * @throws {Error} When model registration fails
   */
  async registerModels(modelDefinitions, knexInstance, CustomBaseModel = null) {
    if (!modelDefinitions || typeof modelDefinitions !== 'object') {
      throw new Error('Model definitions must be an object');
    }

    const modelNames = Object.keys(modelDefinitions);
    if (modelNames.length === 0) {
      throw new Error('Model definitions object cannot be empty');
    }

    const registeredModels = {};
    const errors = [];

    // Register models sequentially to handle dependencies
    for (const modelName of modelNames) {
      try {
        const ModelClass = await this.registerModel(
          modelName,
          modelDefinitions[modelName],
          knexInstance,
          CustomBaseModel
        );
        registeredModels[modelName] = ModelClass;
      } catch (error) {
        errors.push(`${modelName}: ${error.message}`);
      }
    }

    // Handle registration errors
    if (errors.length > 0) {
      const errorMessage = `Failed to register ${errors.length} models: ${errors.join(', ')}`;
      this.#emitError('register-models', errorMessage);
      throw new Error(errorMessage);
    }

    // Emit batch registration event
    this.emit('models-registered', {
      modelNames,
      modelCount: modelNames.length,
      connectionName: this.#connectionName,
      totalModels: this.#registeredModels.size,
      timestamp: new Date(),
    });

    return registeredModels;
  }

  /**
   * Get a registered model by name
   *
   * @param {string} modelName - Name of the model
   * @returns {Function|null} The model class or null if not found
   */
  getModel(modelName) {
    if (!modelName || typeof modelName !== 'string') {
      return null;
    }

    return this.#registeredModels.get(modelName) || null;
  }

  /**
   * Get all registered models
   *
   * @returns {Object} Object mapping model names to model classes
   */
  getModels() {
    const models = {};
    for (const [modelName, ModelClass] of this.#registeredModels) {
      models[modelName] = ModelClass;
    }
    return models;
  }

  /**
   * Get list of registered model names
   *
   * @returns {string[]} Array of model names
   */
  getModelNames() {
    return Array.from(this.#registeredModels.keys());
  }

  /**
   * Check if a model is registered
   *
   * @param {string} modelName - Name of the model
   * @returns {boolean} True if model is registered
   */
  hasModel(modelName) {
    return this.#registeredModels.has(modelName);
  }

  /**
   * Unregister a model
   *
   * @param {string} modelName - Name of the model to unregister
   * @returns {boolean} True if model was unregistered, false if not found
   */
  unregisterModel(modelName) {
    if (!this.#registeredModels.has(modelName)) {
      return false;
    }

    this.#registeredModels.delete(modelName);

    this.emit('model-unregistered', {
      modelName,
      connectionName: this.#connectionName,
      remainingModels: this.#registeredModels.size,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Clear all registered models
   *
   * @returns {number} Number of models that were cleared
   */
  clearModels() {
    const clearedCount = this.#registeredModels.size;
    this.#registeredModels.clear();
    this.#lastModelRegistration = null;

    if (clearedCount > 0) {
      this.emit('models-cleared', {
        clearedCount,
        connectionName: this.#connectionName,
        timestamp: new Date(),
      });
    }

    return clearedCount;
  }

  /**
   * Get comprehensive status information
   *
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      // Core state
      initialized: this.#initialized,

      // Operational state
      hasKnexInstance: !!this.#knexInstance,

      // Connection information
      connection: {
        name: this.#connectionName,
        enabled: this.#config.enabled,
      },

      // Model information
      models: {
        count: this.#registeredModels.size,
        names: this.getModelNames(),
        lastRegistration: this.#lastModelRegistration,
      },

      // Configuration summary
      configuration: {
        enabled: this.#config.enabled,
        bindKnex: this.#config.bindKnex,
        validateModels: this.#config.validateModels,
      },

      // Timestamp
      timestamp: new Date(),

      // Full config (for debugging)
      config: this.#config,
    };
  }

  /**
   * Create a dynamic model class from definition
   *
   * @param {string} modelName - Name of the model
   * @param {Object} modelDefinition - Model definition
   * @param {Function} BaseModelClass - Base model class to extend
   * @returns {Function} Model class
   * @private
   */
  #createDynamicModelClass(modelName, modelDefinition, BaseModelClass) {
    const { tableName, schema = {}, relations = {}, hooks = {} } = modelDefinition;
    const defaultOptions = mergeConfig({}, this.#config.defaultModelOptions);

    // Create dynamic model class
    class DynamicModel extends BaseModelClass {
      static get tableName() {
        return tableName;
      }

      static get modelName() {
        return modelName;
      }

      static get schema() {
        return { ...defaultOptions, ...schema };
      }

      static get relationMappings() {
        return relations;
      }
    }

    // Set model name for debugging
    Object.defineProperty(DynamicModel, 'name', {
      value: modelName,
      configurable: true,
    });

    // Add lifecycle hooks if provided
    if (hooks && typeof hooks === 'object') {
      this.#addModelHooks(DynamicModel, hooks);
    }

    return DynamicModel;
  }

  /**
   * Add lifecycle hooks to model class
   *
   * @param {Function} ModelClass - Model class
   * @param {Object} hooks - Lifecycle hooks
   * @private
   */
  #addModelHooks(ModelClass, hooks) {
    for (const [hookName, hookFunction] of Object.entries(hooks)) {
      if (VALID_OBJECTION_HOOKS.includes(hookName) && typeof hookFunction === 'function') {
        ModelClass.prototype[hookName] = hookFunction;
      }
    }
  }

  /**
   * Emit warning event with consistent structure
   *
   * @param {string} phase - Operation phase
   * @param {string} message - Warning message
   * @private
   */
  #emitWarning(phase, message) {
    this.emit('warning', {
      phase,
      message,
      connectionName: this.#connectionName,
      timestamp: new Date(),
    });
  }

  /**
   * Emit error event with consistent structure
   *
   * @param {string} phase - Operation phase
   * @param {string} message - Error message
   * @param {Error} [error] - Original error object
   * @private
   */
  #emitError(phase, message, error = null) {
    this.emit('error', {
      phase,
      message,
      error: error?.message || message,
      connectionName: this.#connectionName,
      timestamp: new Date(),
    });
  }

  /**
   * Override component classes in the ModelManager with enhanced validation
   *
   * Provides a robust way to replace default component implementations with custom ones.
   * Must be called before creating any ModelManager instances. Supports comprehensive
   * validation and detailed error reporting for better debugging.
   *
   * @param {Object} overrides - Object mapping component names to custom class constructors
   * @param {Object} [options={}] - Override options
   * @param {boolean} [options.strict=true] - If true, performs strict validation and throws on errors; if false, logs warnings
   * @throws {Error} When overrides is invalid or contains invalid components (in strict mode)
   */
  static overrideComponents(overrides, options = {}) {
    // Use functional approach for component override
    return overrideComponents(COMPONENT_CLASSES, overrides, {
      ...options,
      contextName: 'ModelManager',
    });
  }

  /**
   * Shutdown ModelManager and cleanup resources
   *
   * @returns {Promise<Object>} Shutdown result
   */
  async shutdown() {
    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', 'ModelManager already shut down');
      return {
        success: false,
        reason: 'already-shutdown',
        connectionName: this.#connectionName,
        timestamp: new Date(),
      };
    }

    const startTime = Date.now();

    this.#initialized = false;

    try {
      // Emit shutdown started event
      this.emit('shutdown-started', {
        connectionName: this.#connectionName,
        modelCount: this.#registeredModels.size,
        timestamp: new Date(),
      });

      // Clear all models
      const clearedModels = this.clearModels();

      // Reset state
      this.#knexInstance = null;
      this.#lastModelRegistration = null;
      this.#validator = null;

      // Emit shutdown completed event
      this.emit('shutdown-completed', {
        success: true,
        duration: Date.now() - startTime,
        connectionName: this.#connectionName,
        clearedModels,
        timestamp: new Date(),
      });
      this.removeAllListeners();

      return {
        success: true,
        duration: Date.now() - startTime,
        connectionName: this.#connectionName,
        clearedModels,
        timestamp: new Date(),
      };
    } catch (error) {
      this.#emitError('shutdown', `Shutdown failed: ${error.message}`, error);
      throw error;
    }
  }
}
