import {
  VALID_OBJECTION_HOOKS,
  VALID_RELATION_TYPES,
  RESERVED_SQL_KEYWORDS,
} from './ModelConstants';

/**
 * Validates Objection.js model definitions for compliance with Objection.js standards.
 * Provides comprehensive validation of model structure, relations, hooks, and other features.
 */
export class ModelValidator {
  /**
   * Validate model definition structure and content against Objection.js standards
   *
   * @param {string} modelName - Name of the model
   * @param {Object} modelDefinition - Model definition to validate
   * @param {string} modelDefinition.tableName - Database table name
   * @param {Object} [modelDefinition.schema] - Custom schema for BaseModel
   * @param {Object} [modelDefinition.jsonSchema] - Objection.js JSON Schema validation
   * @param {Object} [modelDefinition.relations] - Objection.js relations mapping
   * @param {Object} [modelDefinition.hooks] - Objection.js lifecycle hooks
   * @param {Object} [modelDefinition.modifiers] - Objection.js query modifiers
   * @param {Array<string>} [modelDefinition.virtualAttributes] - Objection.js virtual attributes
   * @throws {Error} When model definition is invalid
   */
  validateModelDefinition(modelName, modelDefinition) {
    const {
      tableName,
      schema = {},
      relations = {},
      hooks = {},
      jsonSchema,
      modifiers,
      virtualAttributes,
    } = modelDefinition;

    // Validate basic structure
    this.#validateTableName(modelName, tableName);
    this.#validateSchema(modelName, schema);

    // Validate Objection.js specific features
    this.#validateJsonSchema(modelName, jsonSchema);
    this.#validateRelations(modelName, relations);
    this.#validateModifiers(modelName, modifiers);
    this.#validateVirtualAttributes(modelName, virtualAttributes);
    this.#validateHooks(modelName, hooks);
  }

  /**
   * Validate pre-defined model class structure for Objection.js compatibility
   *
   * @param {string} modelName - Name of the model
   * @param {Function} ModelClass - Model class to validate
   * @throws {Error} When model class is invalid
   */
  validateModelStructure(modelName, ModelClass) {
    // Check if it's a proper class/constructor
    if (typeof ModelClass !== 'function') {
      throw new Error(`${modelName} must be a constructor function`);
    }

    // Check if it has a prototype (is a proper class)
    if (!ModelClass.prototype) {
      throw new Error(`${modelName} must have a prototype (be a proper class)`);
    }

    // Validate table name using existing validation
    this.#validateTableName(modelName, ModelClass.tableName);

    // Check if it extends from a BaseModel-like class (has Objection.js methods)
    const requiredMethods = ['query', '$query', '$relatedQuery'];
    const hasObjectionMethods = requiredMethods.some(
      method => ModelClass.prototype[method] || ModelClass[method]
    );

    if (!hasObjectionMethods) {
      // This is a warning, not an error - allow non-Objection models but warn
      console.warn(
        `Warning: ${modelName} doesn't appear to extend from Objection.js Model. ` +
          'Ensure it has proper Objection.js methods for database operations.'
      );
    }

    // Validate jsonSchema if present
    if (ModelClass.jsonSchema) {
      this.#validateJsonSchema(modelName, ModelClass.jsonSchema);
    }

    // Validate relationMappings if present
    if (ModelClass.relationMappings) {
      if (typeof ModelClass.relationMappings !== 'object') {
        throw new Error(`${modelName} relationMappings must be an object if provided`);
      }
      this.#validateRelations(modelName, ModelClass.relationMappings);
    }

    // Validate modifiers if present
    if (ModelClass.modifiers) {
      this.#validateModifiers(modelName, ModelClass.modifiers);
    }

    // Validate virtualAttributes if present
    if (ModelClass.virtualAttributes) {
      this.#validateVirtualAttributes(modelName, ModelClass.virtualAttributes);
    }
  }

  /**
   * Validate table name follows SQL identifier rules
   *
   * @param {string} modelName - Name of the model
   * @param {string} tableName - Table name to validate
   * @throws {Error} When table name is invalid
   * @private
   */
  #validateTableName(modelName, tableName) {
    if (typeof tableName !== 'string' || tableName.trim().length === 0) {
      throw new Error(`Model '${modelName}': tableName must be a non-empty string`);
    }

    // Validate table name follows SQL identifier rules
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(
        `Model '${modelName}': tableName '${tableName}' contains invalid characters. ` +
          `Use only letters, numbers, and underscores, starting with letter or underscore.`
      );
    }

    // Check for reserved SQL keywords
    if (RESERVED_SQL_KEYWORDS.includes(tableName.toUpperCase())) {
      throw new Error(
        `Model '${modelName}': tableName '${tableName}' is a reserved SQL keyword. ` +
          `Use a different table name.`
      );
    }
  }

  /**
   * Validate custom schema structure (for BaseModel)
   *
   * @param {string} modelName - Name of the model
   * @param {Object} schema - Schema to validate
   * @throws {Error} When schema is invalid
   * @private
   */
  #validateSchema(modelName, schema) {
    if (schema && typeof schema !== 'object') {
      throw new Error(`Model '${modelName}': schema must be an object`);
    }

    // Validate common schema properties
    if (schema.timestamps != null && typeof schema.timestamps !== 'boolean') {
      throw new Error(`Model '${modelName}': schema.timestamps must be a boolean`);
    }

    if (schema.softDeletes != null && typeof schema.softDeletes !== 'boolean') {
      throw new Error(`Model '${modelName}': schema.softDeletes must be a boolean`);
    }

    if (schema.validation != null && typeof schema.validation !== 'object') {
      throw new Error(`Model '${modelName}': schema.validation must be an object`);
    }
  }

  /**
   * Validate Objection.js JSON Schema
   *
   * @param {string} modelName - Name of the model
   * @param {Object} jsonSchema - JSON Schema to validate
   * @throws {Error} When JSON Schema is invalid
   * @private
   */
  #validateJsonSchema(modelName, jsonSchema) {
    if (jsonSchema == null) return;

    if (typeof jsonSchema !== 'object' || jsonSchema == null) {
      throw new Error(`Model '${modelName}': jsonSchema must be an object`);
    }

    // Basic JSON Schema validation
    if (jsonSchema.type && typeof jsonSchema.type !== 'string') {
      throw new Error(`Model '${modelName}': jsonSchema.type must be a string`);
    }

    if (jsonSchema.properties && typeof jsonSchema.properties !== 'object') {
      throw new Error(`Model '${modelName}': jsonSchema.properties must be an object`);
    }

    if (jsonSchema.required && !Array.isArray(jsonSchema.required)) {
      throw new Error(`Model '${modelName}': jsonSchema.required must be an array`);
    }

    // Validate properties structure
    if (jsonSchema.properties) {
      for (const [propName, propDef] of Object.entries(jsonSchema.properties)) {
        if (typeof propDef !== 'object') {
          throw new Error(
            `Model '${modelName}': jsonSchema.properties.${propName} must be an object`
          );
        }
      }
    }
  }

  /**
   * Validate Objection.js relations
   *
   * @param {string} modelName - Name of the model
   * @param {Object} relations - Relations to validate
   * @throws {Error} When relations are invalid
   * @private
   */
  #validateRelations(modelName, relations) {
    if (relations && typeof relations !== 'object') {
      throw new Error(`Model '${modelName}': relations must be an object`);
    }

    for (const [relationName, relationDef] of Object.entries(relations)) {
      this.#validateSingleRelation(modelName, relationName, relationDef);
    }
  }

  /**
   * Validate a single relation definition
   *
   * @param {string} modelName - Name of the model
   * @param {string} relationName - Name of the relation
   * @param {Object} relationDef - Relation definition to validate
   * @throws {Error} When relation is invalid
   * @private
   */
  #validateSingleRelation(modelName, relationName, relationDef) {
    if (!relationName || typeof relationName !== 'string') {
      throw new Error(`Model '${modelName}': relation name must be a non-empty string`);
    }

    if (!relationDef || typeof relationDef !== 'object') {
      throw new Error(`Model '${modelName}': relation '${relationName}' must be an object`);
    }

    // Validate relation type
    if (!relationDef.relation) {
      throw new Error(
        `Model '${modelName}': relation '${relationName}' must specify a relation type`
      );
    }

    if (
      typeof relationDef.relation === 'string' &&
      !VALID_RELATION_TYPES.includes(relationDef.relation)
    ) {
      throw new Error(
        `Model '${modelName}': relation '${relationName}' has invalid relation type '${relationDef.relation}'. ` +
          `Valid types: ${VALID_RELATION_TYPES.join(', ')}`
      );
    }

    // Validate modelClass
    if (!relationDef.modelClass) {
      throw new Error(`Model '${modelName}': relation '${relationName}' must specify a modelClass`);
    }

    // Validate join configuration
    this.#validateRelationJoin(modelName, relationName, relationDef);
  }

  /**
   * Validate relation join configuration
   *
   * @param {string} modelName - Name of the model
   * @param {string} relationName - Name of the relation
   * @param {Object} relationDef - Relation definition
   * @throws {Error} When join configuration is invalid
   * @private
   */
  #validateRelationJoin(modelName, relationName, relationDef) {
    if (!relationDef.join) {
      throw new Error(
        `Model '${modelName}': relation '${relationName}' must specify join configuration`
      );
    }

    if (typeof relationDef.join !== 'object') {
      throw new Error(`Model '${modelName}': relation '${relationName}' join must be an object`);
    }

    const { join } = relationDef;

    if (relationDef.relation === 'ManyToManyRelation') {
      // Many-to-many relation needs 'through' table
      if (!join.through) {
        throw new Error(
          `Model '${modelName}': ManyToMany relation '${relationName}' must specify 'through' table in join configuration`
        );
      }

      if (typeof join.through !== 'object') {
        throw new Error(
          `Model '${modelName}': relation '${relationName}' join.through must be an object`
        );
      }

      // Validate through table structure
      if (!join.through.from || !join.through.to) {
        throw new Error(
          `Model '${modelName}': relation '${relationName}' join.through must specify 'from' and 'to' properties`
        );
      }
    } else {
      // Simple relation join validation
      if (!join.from || !join.to) {
        throw new Error(
          `Model '${modelName}': relation '${relationName}' join must specify 'from' and 'to' properties`
        );
      }
    }
  }

  /**
   * Validate Objection.js query modifiers
   *
   * @param {string} modelName - Name of the model
   * @param {Object} modifiers - Modifiers to validate
   * @throws {Error} When modifiers are invalid
   * @private
   */
  #validateModifiers(modelName, modifiers) {
    if (modifiers == null) return;

    if (typeof modifiers !== 'object' || modifiers == null) {
      throw new Error(`Model '${modelName}': modifiers must be an object`);
    }

    for (const [modifierName, modifierFn] of Object.entries(modifiers)) {
      if (typeof modifierName !== 'string' || modifierName.trim().length === 0) {
        throw new Error(`Model '${modelName}': modifier name must be a non-empty string`);
      }

      if (typeof modifierFn !== 'function') {
        throw new Error(`Model '${modelName}': modifier '${modifierName}' must be a function`);
      }
    }
  }

  /**
   * Validate Objection.js virtual attributes
   *
   * @param {string} modelName - Name of the model
   * @param {Array<string>} virtualAttributes - Virtual attributes to validate
   * @throws {Error} When virtual attributes are invalid
   * @private
   */
  #validateVirtualAttributes(modelName, virtualAttributes) {
    if (virtualAttributes == null) return;

    if (!Array.isArray(virtualAttributes)) {
      throw new Error(`Model '${modelName}': virtualAttributes must be an array`);
    }

    for (const attr of virtualAttributes) {
      if (typeof attr !== 'string' || attr.trim().length === 0) {
        throw new Error(
          `Model '${modelName}': virtualAttributes must contain only non-empty strings`
        );
      }
    }
  }

  /**
   * Validate Objection.js lifecycle hooks
   *
   * @param {string} modelName - Name of the model
   * @param {Object} hooks - Hooks to validate
   * @throws {Error} When hooks are invalid
   * @private
   */
  #validateHooks(modelName, hooks) {
    if (hooks && typeof hooks !== 'object') {
      throw new Error(`Model '${modelName}': hooks must be an object`);
    }

    for (const [hookName, hookFunction] of Object.entries(hooks)) {
      if (!VALID_OBJECTION_HOOKS.includes(hookName)) {
        throw new Error(
          `Model '${modelName}': invalid hook '${hookName}'. ` +
            `Valid Objection.js hooks: ${VALID_OBJECTION_HOOKS.join(', ')}`
        );
      }

      if (typeof hookFunction !== 'function') {
        throw new Error(`Model '${modelName}': hook '${hookName}' must be a function`);
      }
    }
  }
}
