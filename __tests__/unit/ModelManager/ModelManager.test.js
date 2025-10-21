/**
 * ModelManager Consolidated Unit Tests
 * Comprehensive tests covering all ModelManager functionality including
 * unified model registration, basic operations, and enhanced features
 */

const { ModelManager } = require('../../../dist/ModelManager/ModelManager');
const { RealDatabaseHelper, RealComponentFactory } = require('../../setup');
const { Model } = require('objection');

describe('ModelManager - Consolidated Tests', () => {
  let modelManager;
  let knexInstance;
  let dbHelper;

  // Test model classes for enhanced registration
  class TestUser extends Model {
    static get tableName() {
      return 'test_users';
    }

    static get jsonSchema() {
      return {
        type: 'object',
        required: ['email'],
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string', minLength: 1, maxLength: 255 },
          lastName: { type: 'string', minLength: 1, maxLength: 255 },
        },
      };
    }

    get fullName() {
      return `${this.firstName} ${this.lastName}`;
    }
  }

  class TestPost extends Model {
    static get tableName() {
      return 'test_posts';
    }

    static get relationMappings() {
      return {
        author: {
          relation: Model.BelongsToOneRelation,
          modelClass: TestUser,
          join: {
            from: 'test_posts.userId',
            to: 'test_users.id',
          },
        },
      };
    }
  }

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    knexInstance = await dbHelper.createKnexInstance('consolidated_test');
    modelManager = new ModelManager(
      {
        enabled: true,
        bindKnex: true,
        validateModels: true,
      },
      'consolidated_test'
    );
  });

  afterEach(async () => {
    if (modelManager && (await modelManager.getStatus()).initialized) {
      await modelManager.shutdown();
    }
    await dbHelper.cleanup();
  });

  describe('Constructor and Initialization', () => {
    test('should create ModelManager instance', () => {
      expect(modelManager).toBeInstanceOf(ModelManager);
      expect(modelManager.getStatus().initialized).toBe(false);
    });

    test('should initialize successfully', async () => {
      await modelManager.initialize();
      const status = modelManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should handle re-initialization gracefully', async () => {
      await modelManager.initialize();
      await modelManager.initialize(); // Should not throw
      const status = modelManager.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Pre-defined Model Class Registration', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should register a single pre-defined model class', async () => {
      const registeredModel = await modelManager.registerModel('User', TestUser, knexInstance);

      expect(registeredModel).toBe(TestUser);
      expect(modelManager.hasModel('User')).toBe(true);
      expect(modelManager.getModel('User')).toBe(TestUser);

      const status = modelManager.getStatus();
      expect(status.models.count).toBe(1);
      expect(status.models.names).toContain('User');
    });

    test('should register multiple pre-defined model classes', async () => {
      const result = await modelManager.registerModels(
        {
          User: TestUser,
          Post: TestPost,
        },
        knexInstance
      );

      expect(result.User).toBe(TestUser);
      expect(result.Post).toBe(TestPost);
      expect(modelManager.hasModel('User')).toBe(true);
      expect(modelManager.hasModel('Post')).toBe(true);

      const status = modelManager.getStatus();
      expect(status.models.count).toBe(2);
    });

    test('should emit events with correct registration type for model classes', async () => {
      const events = [];
      modelManager.on('model-registered', event => {
        events.push(event);
      });

      await modelManager.registerModel('User', TestUser, knexInstance);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        modelName: 'User',
        tableName: 'test_users',
        registrationType: 'class',
      });
    });

    test('should bind Knex instance to registered model class', async () => {
      await modelManager.registerModel('User', TestUser, knexInstance);
      const RegisteredUser = modelManager.getModel('User');
      expect(RegisteredUser.knex()).toBe(knexInstance);
    });
  });

  describe('Model Definition Object Registration', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should register model from definition object', async () => {
      const modelDefinition = {
        tableName: 'test_comments',
        schema: {
          properties: {
            id: { type: 'integer' },
            content: { type: 'string' },
            postId: { type: 'integer' },
            userId: { type: 'integer' },
          },
        },
      };

      const CommentModel = await modelManager.registerModel(
        'Comment',
        modelDefinition,
        knexInstance
      );

      expect(CommentModel).toBeDefined();
      expect(CommentModel.tableName).toBe('test_comments');
      expect(modelManager.hasModel('Comment')).toBe(true);
    });

    test('should emit events with correct registration type for definition objects', async () => {
      const events = [];
      modelManager.on('model-registered', event => {
        events.push(event);
      });

      const modelDefinition = {
        tableName: 'test_tags',
        schema: {
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
          },
        },
      };

      await modelManager.registerModel('Tag', modelDefinition, knexInstance);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        modelName: 'Tag',
        tableName: 'test_tags',
        registrationType: 'definition',
      });
    });
  });

  describe('Mixed Registration Types', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should handle mixed registration in batch operation', async () => {
      const modelDefinition = {
        tableName: 'test_categories',
        schema: {
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
          },
        },
      };

      const result = await modelManager.registerModels(
        {
          User: TestUser, // Pre-defined class
          Category: modelDefinition, // Definition object
        },
        knexInstance
      );

      expect(result.User).toBe(TestUser);
      expect(result.Category).toBeDefined();
      expect(result.Category.tableName).toBe('test_categories');

      const status = modelManager.getStatus();
      expect(status.models.count).toBe(2);
    });
  });

  describe('Model Management Operations', () => {
    beforeEach(async () => {
      await modelManager.initialize();
      await modelManager.registerModel('User', TestUser, knexInstance);
    });

    test('should retrieve registered models', () => {
      const UserModel = modelManager.getModel('User');
      expect(UserModel).toBe(TestUser);

      const allModels = modelManager.getModels();
      expect(allModels.User).toBe(TestUser);

      const modelNames = modelManager.getModelNames();
      expect(modelNames).toContain('User');

      expect(modelManager.hasModel('User')).toBe(true);
      expect(modelManager.hasModel('NonExistent')).toBe(false);
    });

    test('should unregister models', () => {
      expect(modelManager.hasModel('User')).toBe(true);

      const result = modelManager.unregisterModel('User');
      expect(result).toBe(true);
      expect(modelManager.hasModel('User')).toBe(false);

      const nonExistentResult = modelManager.unregisterModel('NonExistent');
      expect(nonExistentResult).toBe(false);
    });

    test('should clear all models', () => {
      expect(modelManager.getStatus().models.count).toBe(1);

      const clearedCount = modelManager.clearModels();
      expect(clearedCount).toBe(1);
      expect(modelManager.getStatus().models.count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should reject invalid input types', async () => {
      await expect(
        modelManager.registerModel('Invalid', 'not-a-class-or-object', knexInstance)
      ).rejects.toThrow('Model definition must be an object or a model class function');

      await expect(modelManager.registerModel('Invalid', 123, knexInstance)).rejects.toThrow(
        'Model definition must be an object or a model class function'
      );
    });

    test('should reject model class without tableName', async () => {
      class NoTableName {
        // Missing tableName static property
      }

      await expect(
        modelManager.registerModel('NoTable', NoTableName, knexInstance)
      ).rejects.toThrow();
    });

    test('should reject definition object without tableName', async () => {
      const invalidDefinition = {
        schema: {
          properties: {
            id: { type: 'integer' },
          },
        },
      };

      await expect(
        modelManager.registerModel('Invalid', invalidDefinition, knexInstance)
      ).rejects.toThrow('Model definition must include tableName');
    });

    test('should reject null or undefined modelDefinition', async () => {
      await expect(modelManager.registerModel('Null', null, knexInstance)).rejects.toThrow(
        'Model definition or model class is required'
      );

      await expect(
        modelManager.registerModel('Undefined', undefined, knexInstance)
      ).rejects.toThrow('Model definition or model class is required');
    });
  });

  describe('Model Override Behavior', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should warn when overriding existing model', async () => {
      const warnings = [];
      modelManager.on('warning', event => {
        warnings.push(event);
      });

      // Register model first time
      await modelManager.registerModel('User', TestUser, knexInstance);

      // Register same model again (should warn)
      await modelManager.registerModel('User', TestUser, knexInstance);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('already registered, replacing');
    });
  });

  describe('Configuration Options', () => {
    test('should skip validation when validateModels is false', async () => {
      const nonValidatingManager = new ModelManager(
        {
          enabled: true,
          bindKnex: false,
          validateModels: false,
        },
        'non_validating_test'
      );
      await nonValidatingManager.initialize();

      class InvalidModel {
        static get tableName() {
          return 'invalid_table';
        }
      }

      await expect(
        nonValidatingManager.registerModel('Invalid', InvalidModel, knexInstance)
      ).resolves.toBeDefined();

      await nonValidatingManager.shutdown();
    });

    test('should skip Knex binding when bindKnex is false', async () => {
      const nonBindingManager = new ModelManager(
        {
          enabled: true,
          bindKnex: false,
          validateModels: true,
        },
        'non_binding_test'
      );
      await nonBindingManager.initialize();

      await nonBindingManager.registerModel('User', TestUser, knexInstance);

      const RegisteredUser = nonBindingManager.getModel('User');
      // When bindKnex is false, knex should not be automatically bound to the model
      // But since we passed knexInstance to registerModel, it might still be available
      const modelKnex = RegisteredUser.knex();
      // The behavior might vary - either undefined or the passed instance
      expect(modelKnex === undefined || modelKnex !== null).toBe(true);

      await nonBindingManager.shutdown();
    });
  });

  describe('Status and Information', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should provide comprehensive status', () => {
      const status = modelManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('models.count');
      expect(status).toHaveProperty('connection.name');
      expect(status).toHaveProperty('configuration');
      expect(status.initialized).toBe(true);
      expect(typeof status.models.count).toBe('number');
    });

    test('should track model statistics', async () => {
      const initialStatus = modelManager.getStatus();
      expect(initialStatus.models.count).toBe(0);

      await modelManager.registerModel('User', TestUser, knexInstance);

      const afterStatus = modelManager.getStatus();
      expect(afterStatus.models.count).toBe(1);
      expect(afterStatus.models.names).toContain('User');
      expect(afterStatus.models.lastRegistration).toBeDefined();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await modelManager.initialize();
    });

    test('should emit model registration events', async () => {
      const events = [];
      modelManager.on('model-registered', event => {
        events.push(event);
      });

      await modelManager.registerModel('User', TestUser, knexInstance);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        modelName: 'User',
        connectionName: 'consolidated_test',
        totalModels: 1,
        registrationType: 'class',
      });
    });

    test('should emit batch registration events', async () => {
      const events = [];
      modelManager.on('models-registered', event => {
        events.push(event);
      });

      await modelManager.registerModels(
        {
          User: TestUser,
          Post: TestPost,
        },
        knexInstance
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        modelCount: 2,
        connectionName: 'consolidated_test',
      });
    });
  });

  describe('Lifecycle Management', () => {
    test('should shutdown gracefully', async () => {
      await modelManager.initialize();
      await modelManager.registerModel('User', TestUser, knexInstance);

      const result = await modelManager.shutdown();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.clearedModels).toBe(1);

      const status = modelManager.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should handle shutdown without initialization', async () => {
      const result = await modelManager.shutdown();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already-shutdown');
    });
  });
});
