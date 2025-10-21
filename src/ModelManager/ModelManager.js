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
   * Model Sharing and Extension:
   * - By default, models are NOT shared (isShared: false)
   * - Attempting to register a duplicate non-shared model throws an error
   * - Set static isShared = true on a model to allow extension by other models
   * - When a shared model is re-registered, an inherited model is created combining both
   *
   * @param {string} modelName - Name of the model
   * @param {Object|Function} modelDefinition - Model definition object OR pre-defined model class
   * @param {string} [modelDefinition.tableName] - Database table name (for definition objects)
   * @param {boolean} [modelDefinition.isShared=false] - Allow this model to be extended (for definition objects)

   * @param {Object} [modelDefinition.schema] - Model schema definition (for definition objects)
   * @param {Object} [modelDefinition.relations] - Model relations definition (for definition objects)
   * @param {Object} [modelDefinition.hooks] - Model lifecycle hooks (for definition objects)
   * @param {Object} knexInstance - Knex database connection instance
   * @param {Function} [CustomBaseModel] - Custom BaseModel class to extend from (for definition objects)
   * @returns {Promise<Function>} The registered model class (or inherited model if extending shared model)
   * @throws {Error} When model registration fails or duplicate non-shared model is registered
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
    let modelTableName;
    let modelRegistrationType;

    // Extract configuration and check for existing model registration
    const existingModelClass = this.#registeredModels.get(modelName);
    const existingModelIsShared = existingModelClass && this.#isSharedModel(existingModelClass);

    if (isModelClass) {
      // Handle pre-defined model class registration
      modelRegistrationType = 'class';
      ModelClass = modelDefinition;
      modelTableName = ModelClass.tableName;

      // Validate model class structure if validation is enabled
      if (this.#config.validateModels) {
        this.#validator.validateModelStructure(modelName, ModelClass);
      }

      // Check if we should create an inherited model instead of replacing
      if (existingModelIsShared) {
        modelRegistrationType = 'class-inheritance';

        this.#emitWarning(
          'register-model',
          `Model '${modelName}' is shared - creating inherited model`
        );
      }

      // Create class-based inheritance by composing existing and new model
      if (modelRegistrationType === 'class-inheritance') {
        ModelClass = this.#createInheritedModelClass(modelName, ModelClass, existingModelClass);
      }
    } else {
      // Handle model definition object registration
      modelRegistrationType = 'definition';

      // Validate model definition structure
      if (typeof modelDefinition !== 'object') {
        throw new Error('Model definition must be an object or a model class function');
      }

      modelTableName = modelDefinition.tableName;

      // Perform comprehensive model validation if enabled
      if (this.#config.validateModels) {
        this.#validator.validateModelDefinition(modelName, modelDefinition);
      }

      // Check if we should create an inherited model instead of replacing
      if (existingModelIsShared) {
        modelRegistrationType = 'definition-inheritance';

        this.#emitWarning(
          'register-model',
          `Model '${modelName}' is shared - creating inherited model`
        );
      }

      // Determine the appropriate base class for model creation
      const baseClassForCreation = existingModelIsShared
        ? existingModelClass // Use existing model as base for inheritance
        : CustomBaseModel || COMPONENT_CLASSES.BaseModel; // Use default base class

      // Create dynamic model class from definition
      ModelClass = this.#createDynamicModelClass(modelName, modelDefinition, baseClassForCreation);
    }

    try {
      // Throw error if trying to register duplicate model that is not shared
      if (
        existingModelClass &&
        !['definition-inheritance', 'class-inheritance'].includes(modelRegistrationType)
      ) {
        throw new Error(
          `Cannot register model '${modelName}': A model with this name already exists and is not shared. ` +
            `Set 'isShared: true' on the existing model to allow extension.`
        );
      }

      // Store Knex instance for binding
      this.#knexInstance = knexInstance;

      // Bind Knex instance to model if enabled
      if (this.#config.bindKnex) {
        ModelClass.knex(knexInstance);
      }

      // Store registered model in the registry
      this.#registeredModels.set(modelName, ModelClass);
      this.#lastModelRegistration = new Date();

      // Emit registration event with comprehensive details
      this.emit('model-registered', {
        modelName,
        tableName: modelTableName,
        registrationType: modelRegistrationType,
        connectionName: this.#connectionName,
        totalModels: this.#registeredModels.size,
        timestamp: new Date(),
        modelClass: ModelClass,
      });

      return ModelClass;
    } catch (error) {
      // Handle registration errors gracefully
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
    const { tableName, schema = {}, relations = {}, hooks = {}, isShared } = modelDefinition;
    const defaultOptions = mergeConfig({}, this.#config.defaultModelOptions);

    // Prepare static properties for the model class
    const staticProperties = {
      tableName: () => tableName,
      modelName: () => modelName,
      schema: () => ({ ...defaultOptions, ...schema }),
      relationMappings: () => relations,
    };

    // Add isShared property if specified in definition
    if (typeof isShared === 'boolean') {
      staticProperties.isShared = () => isShared;
    }

    // Create model class using shared utility
    const DynamicModel = this.#createModelClass({
      modelName,
      staticProperties,
      baseClass: BaseModelClass,
    });

    // Add lifecycle hooks if provided
    if (hooks && typeof hooks === 'object') {
      this.#addModelHooks(DynamicModel, hooks);
    }

    return DynamicModel;
  }

  /**
   * Create an inherited model class that extends functionality from a base model
   * This implements model inheritance when the existing model has isShared: true
   * The resulting class combines properties and methods from both models
   *
   * @param {string} modelName - The name identifier for the model
   * @param {Function} newModelClass - The new model class to be extended
   * @param {Function} existingModelClass - The existing registered model class to inherit from
   * @returns {Function} The composed inherited model class
   * @private
   */
  #createInheritedModelClass(modelName, newModelClass, existingModelClass) {
    const modelTableName = newModelClass.tableName || existingModelClass.tableName;

    // Create inherited model class using shared utility with intelligent property merging
    const InheritedModelClass = this.#createModelClass({
      modelName,
      baseClass: existingModelClass,
      staticProperties: {
        tableName: () => modelTableName,
        modelName: () => modelName,
        jsonSchema: () => this.#mergeJsonSchemas(existingModelClass, newModelClass),
        relationMappings: () =>
          this.#mergeObjectProperties(existingModelClass, newModelClass, 'relationMappings'),
        modifiers: () =>
          this.#mergeObjectProperties(existingModelClass, newModelClass, 'modifiers'),
        virtualAttributes: () =>
          this.#mergeArrayProperties(existingModelClass, newModelClass, 'virtualAttributes'),
      },
    });

    // Transfer instance methods from new model to inherited model (allows method overriding)
    this.#transferInstanceMethods(newModelClass, InheritedModelClass);

    // Transfer static methods from new model to inherited model (with safety checks)
    this.#transferStaticMethods(newModelClass, InheritedModelClass);

    return InheritedModelClass;
  }

  /**
   * Shared utility to create model classes with consistent structure
   * Eliminates duplication between dynamic and inherited model creation
   * Uses ES6 class extension with dynamic property injection
   *
   * @param {Object} creationOptions - Model class creation configuration
   * @param {string} creationOptions.modelName - Name of the model
   * @param {Function} creationOptions.baseClass - Base class to extend from
   * @param {Object} creationOptions.staticProperties - Static properties to add to the class
   * @returns {Function} Created model class
   * @private
   */
  #createModelClass({ modelName, baseClass, staticProperties }) {
    // Create the model class dynamically using ES6 class extension
    class GeneratedModelClass extends baseClass {}

    // Inject static properties using property descriptors with getters
    Object.entries(staticProperties).forEach(([propertyName, propertyGetterFunction]) => {
      Object.defineProperty(GeneratedModelClass, propertyName, {
        get: propertyGetterFunction,
        configurable: true,
        enumerable: true,
      });
    });

    // Set descriptive class name
    Object.defineProperty(GeneratedModelClass, 'name', {
      value: modelName,
      configurable: true,
    });

    return GeneratedModelClass;
  }

  /**
   * Safely merge JSON schemas from existing and new models
   * Combines schema properties at both root and properties level
   * New model schema properties take precedence over existing ones
   *
   * @param {Function} existingModelClass - Existing registered model class
   * @param {Function} newModelClass - New model class being registered
   * @returns {Object} Merged JSON schema with combined properties
   * @private
   */
  #mergeJsonSchemas(existingModelClass, newModelClass) {
    const existingSchema = this.#safelyGetStaticProperty(existingModelClass, 'jsonSchema', {});
    const newSchema = this.#safelyGetStaticProperty(newModelClass, 'jsonSchema', {});

    return {
      // Merge root-level schema properties (new overrides existing)
      ...(existingSchema || {}),
      ...(newSchema || {}),
      // Merge properties object specifically (combining field definitions)
      properties: {
        ...((existingSchema && existingSchema.properties) || {}),
        ...((newSchema && newSchema.properties) || {}),
      },
    };
  }

  /**
   * Safely merge object properties from existing and new models
   * Generic utility for merging relationMappings, modifiers, etc.
   * New model properties take precedence over existing ones
   *
   * @param {Function} existingModelClass - Existing registered model class
   * @param {Function} newModelClass - New model class being registered
   * @param {string} staticPropertyName - Name of the static property to merge
   * @returns {Object} Merged object properties
   * @private
   */
  #mergeObjectProperties(existingModelClass, newModelClass, staticPropertyName) {
    const existingProperties = this.#safelyGetStaticProperty(
      existingModelClass,
      staticPropertyName,
      {}
    );
    const newProperties = this.#safelyGetStaticProperty(newModelClass, staticPropertyName, {});

    return {
      // Existing properties as base
      ...existingProperties,
      // New properties override existing ones
      ...newProperties,
    };
  }

  /**
   * Safely merge array properties from existing and new models with deduplication
   * Combines arrays and removes duplicates using Set for uniqueness
   * Useful for merging virtualAttributes and similar array-based properties
   *
   * @param {Function} existingModelClass - Existing registered model class
   * @param {Function} newModelClass - New model class being registered
   * @param {string} staticPropertyName - Name of the static array property to merge
   * @returns {Array} Merged and deduplicated array
   * @private
   */
  #mergeArrayProperties(existingModelClass, newModelClass, staticPropertyName) {
    const existingArray = this.#safelyGetStaticProperty(existingModelClass, staticPropertyName, []);
    const newArray = this.#safelyGetStaticProperty(newModelClass, staticPropertyName, []);

    // Combine arrays and remove duplicates using Set
    return [...new Set([...existingArray, ...newArray])];
  }

  /**
   * Safely access static properties with comprehensive error handling
   * Prevents crashes from private field access issues or undefined properties
   * Returns fallback value if property access fails for any reason
   *
   * @param {Function} targetModelClass - Model class to access property from
   * @param {string} staticPropertyName - Name of the static property to access
   * @param {*} fallbackValue - Default value if property access fails
   * @returns {*} Property value or fallback value
   * @private
   */
  #safelyGetStaticProperty(targetModelClass, staticPropertyName, fallbackValue) {
    try {
      const propertyValue = targetModelClass[staticPropertyName];
      return propertyValue !== undefined ? propertyValue : fallbackValue;
    } catch {
      // Handle private field access issues, getter errors, etc. gracefully
      return fallbackValue;
    }
  }

  /**
   * Get the isShared flag from a model class to determine if it allows extension
   * Checks both static property and definition object for the isShared flag
   *
   * @param {Function|Object} modelClass - Model class or definition to check
   * @returns {boolean} True if model is marked as shared, false otherwise
   * @private
   */
  #isSharedModel(modelClass) {
    try {
      // For model classes, check static isShared property
      if (typeof modelClass === 'function') {
        return this.#safelyGetStaticProperty(modelClass, 'isShared', false);
      }

      // For definition objects, check isShared property
      if (typeof modelClass === 'object' && modelClass != null) {
        return Boolean(modelClass.isShared);
      }

      return false;
    } catch {
      // Default to false if any error occurs
      return false;
    }
  }

  /**
   * Transfer instance methods from source to target model class
   * Copies all non-constructor methods, allowing method overriding
   * Enables new model methods to override existing model methods
   *
   * @param {Function} sourceModelClass - Source model class (new model)
   * @param {Function} targetModelClass - Target model class (inherited model)
   * @private
   */
  #transferInstanceMethods(sourceModelClass, targetModelClass) {
    const sourcePrototype = sourceModelClass.prototype;
    const targetPrototype = targetModelClass.prototype;

    // Iterate through all properties on the source prototype
    Object.getOwnPropertyNames(sourcePrototype).forEach(methodName => {
      if (methodName !== 'constructor' && typeof sourcePrototype[methodName] === 'function') {
        // Transfer method to target prototype (enables method overriding)
        targetPrototype[methodName] = sourcePrototype[methodName];
      }
    });
  }

  /**
   * Transfer static methods from source to target model class
   * Copies static methods while excluding core properties handled elsewhere
   * Provides safe transfer with error handling for problematic methods
   *
   * @param {Function} sourceModelClass - Source model class (new model)
   * @param {Function} targetModelClass - Target model class (inherited model)
   * @private
   */
  #transferStaticMethods(sourceModelClass, targetModelClass) {
    // Properties to exclude from transfer (handled by other mechanisms)
    const excludedStaticProperties = new Set([
      'prototype', // JavaScript built-in
      'name', // Class name (set separately)
      'length', // Constructor parameter count
      'tableName', // Handled by static property merging
      'modelName', // Handled by static property merging
      'jsonSchema', // Handled by schema merging
      'relationMappings', // Handled by object property merging
      'modifiers', // Handled by object property merging
      'virtualAttributes', // Handled by array property merging
    ]);

    // Transfer all non-excluded static methods
    Object.getOwnPropertyNames(sourceModelClass).forEach(staticPropertyName => {
      if (
        !excludedStaticProperties.has(staticPropertyName) &&
        typeof sourceModelClass[staticPropertyName] === 'function'
      ) {
        try {
          // Transfer static method to target class
          targetModelClass[staticPropertyName] = sourceModelClass[staticPropertyName];
        } catch (error) {
          // Gracefully skip methods that cannot be transferred (e.g., private field access)
        }
      }
    });
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
