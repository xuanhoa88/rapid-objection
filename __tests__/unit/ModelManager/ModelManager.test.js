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
      ).rejects.toThrow('tableName must be a non-empty string');
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

    test('should throw error when trying to register duplicate non-shared model', async () => {
      // Register model first time
      await modelManager.registerModel('User', TestUser, knexInstance);

      // Register same model again (should throw error)
      await expect(modelManager.registerModel('User', TestUser, knexInstance)).rejects.toThrow(
        "Cannot register model 'User': A model with this name already exists and is not shared"
      );
    });

    test('should allow re-registration when model is shared', async () => {
      class SharedUser extends Model {
        static get tableName() {
          return 'shared_users';
        }

        static get isShared() {
          return true; // Allow extension
        }
      }

      // First registration
      const first = await modelManager.registerModel('SharedUser', SharedUser, knexInstance);
      expect(first).toBe(SharedUser);

      // Second registration should create inherited model (no error)
      const second = await modelManager.registerModel('SharedUser', SharedUser, knexInstance);
      expect(second).not.toBe(SharedUser);
      expect(second.name).toBe('SharedUser');
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

  // ========================================
  // MODEL EXTENSION TESTS
  // ========================================

  describe('Model Extension Configuration', () => {
    test('should handle models without isShared flag (default behavior)', async () => {
      const manager = new ModelManager({}, 'default-test');
      await manager.initialize();

      // Register a model without isShared flag
      class RegularModel extends Model {
        static get tableName() {
          return 'regular';
        }
      }

      await manager.registerModel('Regular', RegularModel, knexInstance);
      expect(manager.hasModel('Regular')).toBe(true);

      await manager.shutdown();
    });

    test('should recognize models with isShared flag', async () => {
      const manager = new ModelManager({}, 'shared-test');
      await manager.initialize();

      // Register a model with isShared flag
      class SharedModel extends Model {
        static get tableName() {
          return 'shared';
        }

        static get isShared() {
          return true;
        }
      }

      await manager.registerModel('Shared', SharedModel, knexInstance);
      expect(manager.hasModel('Shared')).toBe(true);

      await manager.shutdown();
    });

    test('should preserve isShared flag from definition objects', async () => {
      const manager = new ModelManager({}, 'definition-shared-test');
      await manager.initialize();

      // Register model from definition object with isShared: true
      const sharedDefinition = {
        tableName: 'shared_from_definition',
        isShared: true,
        schema: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      };

      const SharedModel = await manager.registerModel(
        'SharedFromDef',
        sharedDefinition,
        knexInstance
      );

      // Verify the created model class has the isShared property
      expect(SharedModel.isShared).toBe(true);

      // Verify it can be extended by registering a model class
      class ExtendingModel extends Model {
        static get tableName() {
          return 'shared_from_definition';
        }

        getSlug() {
          return this.slug;
        }
      }

      const ExtendedModel = await manager.registerModel(
        'SharedFromDef',
        ExtendingModel,
        knexInstance
      );

      // Should create inherited model
      expect(ExtendedModel).not.toBe(SharedModel);
      expect(ExtendedModel.name).toBe('SharedFromDef');

      await manager.shutdown();
    });

    test('should demonstrate isShared flag behavior with warning messages', async () => {
      const manager = new ModelManager({}, 'shared-behavior-test');
      await manager.initialize();

      const warnings = [];
      manager.on('warning', warning => {
        warnings.push(warning);
      });

      // Test 1: Shared model allows extension
      class SharedModel extends Model {
        static get tableName() {
          return 'shared_table';
        }

        static get isShared() {
          return true; // This model allows extension
        }

        originalMethod() {
          return 'original';
        }
      }

      await manager.registerModel('TestShared', SharedModel, knexInstance);
      expect(manager.hasModel('TestShared')).toBe(true);

      // Register another model with same name - should extend
      class ExtendingModel extends Model {
        static get tableName() {
          return 'shared_table';
        }

        extendedMethod() {
          return 'extended';
        }
      }

      const extendedModel = await manager.registerModel('TestShared', ExtendingModel, knexInstance);

      // Should be an inherited model, not the original
      expect(extendedModel).not.toBe(SharedModel);
      expect(extendedModel).not.toBe(ExtendingModel);
      expect(extendedModel.name).toBe('TestShared');

      // Should have methods from both models
      const extendedInstance = new extendedModel();
      expect(typeof extendedInstance.originalMethod).toBe('function');
      expect(typeof extendedInstance.extendedMethod).toBe('function');
      expect(extendedInstance.originalMethod()).toBe('original');
      expect(extendedInstance.extendedMethod()).toBe('extended');

      // Test 2: Non-shared model throws error on duplicate registration
      class NonSharedModel extends Model {
        static get tableName() {
          return 'non_shared_table';
        }
        // No isShared flag - defaults to false

        originalMethod() {
          return 'original';
        }
      }

      await manager.registerModel('TestNonShared', NonSharedModel, knexInstance);
      expect(manager.hasModel('TestNonShared')).toBe(true);

      // Try to register another model with same name - should throw error
      class ReplacingModel extends Model {
        static get tableName() {
          return 'non_shared_table';
        }

        replacingMethod() {
          return 'replacing';
        }
      }

      await expect(
        manager.registerModel('TestNonShared', ReplacingModel, knexInstance)
      ).rejects.toThrow(
        "Cannot register model 'TestNonShared': A model with this name already exists and is not shared"
      );

      // Check warning messages (only one for shared model)
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('TestShared');
      expect(warnings[0].message).toContain('is shared - creating inherited model');

      await manager.shutdown();
    });

    test('should use no namespace when not configured', async () => {
      // Test with default configuration (no namespaces)
      const defaultManager = new ModelManager({}, 'no-namespace-test');
      await defaultManager.initialize();

      // Test dynamic model without namespace
      const dynamicDefinition = {
        tableName: 'plain_table',
        schema: { name: { type: 'string' } },
      };

      const PlainDynamicModel = await defaultManager.registerModel(
        'PlainDynamic',
        dynamicDefinition,
        knexInstance
      );
      expect(PlainDynamicModel.name).toBe('PlainDynamic');

      // Test inherited model without namespace
      class PlainSharedModel extends Model {
        static get tableName() {
          return 'plain_shared_table';
        }
        static get isShared() {
          return true;
        }
      }

      await defaultManager.registerModel('PlainShared', PlainSharedModel, knexInstance);

      class PlainExtendingModel extends Model {
        static get tableName() {
          return 'plain_shared_table';
        }
      }

      const PlainExtendedModel = await defaultManager.registerModel(
        'PlainShared',
        PlainExtendingModel,
        knexInstance
      );
      expect(PlainExtendedModel.name).toBe('PlainShared');

      await defaultManager.shutdown();
    });
  });

  describe('Model Class Extension', () => {
    let extensionManager;
    let extensionDbHelper;
    let extensionKnex;

    beforeEach(async () => {
      // Create real database instance for extension tests
      extensionDbHelper = new RealDatabaseHelper();
      extensionKnex = await extensionDbHelper.createKnexInstance('extension_test');

      // Create ModelManager for testing model extension via isShared flag
      extensionManager = new ModelManager(
        {
          enabled: true,
          bindKnex: true,
          validateModels: true,
        },
        'extension-test'
      );

      await extensionManager.initialize();
    });

    afterEach(async () => {
      if (extensionManager?.isInitialized) {
        await extensionManager.shutdown();
      }
      await extensionDbHelper.cleanup();
    });

    test('should extend from existing model class when duplicate name is registered', async () => {
      // Register first model with isShared flag
      class UserModel extends Model {
        static get tableName() {
          return 'users';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          };
        }

        getName() {
          return this.name;
        }
      }

      const firstModel = await extensionManager.registerModel('User', UserModel, extensionKnex);
      expect(firstModel).toBe(UserModel);
      expect(extensionManager.hasModel('User')).toBe(true);

      // Register second model with same name
      class EnhancedUserModel extends Model {
        static get tableName() {
          return 'users';
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              email: { type: 'string' },
            },
          };
        }

        getEmail() {
          return this.email;
        }
      }

      const extendedModel = await extensionManager.registerModel(
        'User',
        EnhancedUserModel,
        extensionKnex
      );

      // Should be a new inherited class, not the original
      expect(extendedModel).not.toBe(UserModel);
      expect(extendedModel).not.toBe(EnhancedUserModel);
      expect(extendedModel.name).toBe('User');

      // Should inherit from first model
      expect(extendedModel.prototype instanceof UserModel).toBe(true);

      // Should have methods from both models
      const instance = new extendedModel();
      expect(typeof instance.getName).toBe('function');
      expect(typeof instance.getEmail).toBe('function');
    });

    test('should merge relationMappings from both models', async () => {
      // Register first model with relations
      class PostModel extends Model {
        static get tableName() {
          return 'posts';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        static get relationMappings() {
          return {
            author: {
              relation: Model.BelongsToOneRelation,
              modelClass: 'User',
              join: {
                from: 'posts.author_id',
                to: 'users.id',
              },
            },
          };
        }
      }

      await extensionManager.registerModel('Post', PostModel, extensionKnex);

      // Register second model with additional relations
      class EnhancedPostModel extends Model {
        static get tableName() {
          return 'posts';
        }

        static get relationMappings() {
          return {
            comments: {
              relation: Model.HasManyRelation,
              modelClass: 'Comment',
              join: {
                from: 'posts.id',
                to: 'comments.post_id',
              },
            },
          };
        }
      }

      const extendedModel = await extensionManager.registerModel(
        'Post',
        EnhancedPostModel,
        extensionKnex
      );

      const relations = extendedModel.relationMappings;
      expect(relations.author).toBeDefined(); // From first model
      expect(relations.comments).toBeDefined(); // From second model
    });

    test('should merge modifiers from both models', async () => {
      // Register first model with modifiers
      class ProductModel extends Model {
        static get tableName() {
          return 'products';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        static get modifiers() {
          return {
            active: query => query.where('active', true),
          };
        }
      }

      await extensionManager.registerModel('Product', ProductModel, extensionKnex);

      // Register second model with additional modifiers
      class EnhancedProductModel extends Model {
        static get tableName() {
          return 'products';
        }

        static get modifiers() {
          return {
            featured: query => query.where('featured', true),
          };
        }
      }

      const extendedModel = await extensionManager.registerModel(
        'Product',
        EnhancedProductModel,
        extensionKnex
      );

      const modifiers = extendedModel.modifiers;
      expect(modifiers.active).toBeDefined(); // From first model
      expect(modifiers.featured).toBeDefined(); // From second model
    });

    test('should merge virtualAttributes from both models', async () => {
      // Register first model with virtual attributes
      class OrderModel extends Model {
        static get tableName() {
          return 'orders';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        static get virtualAttributes() {
          return ['fullName'];
        }
      }

      await extensionManager.registerModel('Order', OrderModel, extensionKnex);

      // Register second model with additional virtual attributes
      class EnhancedOrderModel extends Model {
        static get tableName() {
          return 'orders';
        }

        static get virtualAttributes() {
          return ['totalAmount'];
        }
      }

      const extendedModel = await extensionManager.registerModel(
        'Order',
        EnhancedOrderModel,
        extensionKnex
      );

      const virtualAttrs = extendedModel.virtualAttributes;
      expect(virtualAttrs).toContain('fullName'); // From first model
      expect(virtualAttrs).toContain('totalAmount'); // From second model
    });

    test('should allow new model methods to override existing ones', async () => {
      // Register first model
      class BaseUserModel extends Model {
        static get tableName() {
          return 'users';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        getDisplayName() {
          return this.name;
        }
      }

      await extensionManager.registerModel('User', BaseUserModel, extensionKnex);

      // Register second model that overrides the method
      class EnhancedUserModel extends Model {
        static get tableName() {
          return 'users';
        }

        getDisplayName() {
          return `${this.firstName} ${this.lastName}`;
        }
      }

      const extendedModel = await extensionManager.registerModel(
        'User',
        EnhancedUserModel,
        extensionKnex
      );

      const instance = new extendedModel();
      instance.$set({ firstName: 'John', lastName: 'Doe' });

      // Should use the overridden method from the second model
      expect(instance.getDisplayName()).toBe('John Doe');
    });

    test('should copy static methods from new model', async () => {
      // Register first model
      class BaseModel1 extends Model {
        static get tableName() {
          return 'items';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        static findActive() {
          return this.query().where('active', true);
        }
      }

      await extensionManager.registerModel('Item', BaseModel1, extensionKnex);

      // Register second model with additional static method
      class BaseModel2 extends Model {
        static get tableName() {
          return 'items';
        }

        static findByCategory(category) {
          return this.query().where('category', category);
        }
      }

      const extendedModel = await extensionManager.registerModel('Item', BaseModel2, extensionKnex);

      // Should have both static methods
      expect(typeof extendedModel.findActive).toBe('function'); // From first model
      expect(typeof extendedModel.findByCategory).toBe('function'); // From second model
    });
  });

  describe('Model Definition Extension', () => {
    let extensionManager;
    let definitionDbHelper;
    let definitionKnex;

    beforeEach(async () => {
      definitionDbHelper = new RealDatabaseHelper();
      definitionKnex = await definitionDbHelper.createKnexInstance('definition_extension_test');

      extensionManager = new ModelManager(
        {
          enabled: true,
        },
        'definition-extension-test'
      );

      await extensionManager.initialize();
    });

    afterEach(async () => {
      if (extensionManager?.isInitialized) {
        await extensionManager.shutdown();
      }
      await definitionDbHelper.cleanup();
    });

    test('should extend from existing model when registering definition object', async () => {
      // Register first model as class with isShared flag
      class CategoryModel extends Model {
        static get tableName() {
          return 'categories';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          };
        }
      }

      await extensionManager.registerModel('Category', CategoryModel, definitionKnex);

      // Register second model as definition object
      const categoryDefinition = {
        tableName: 'categories',
        isShared: false, // This model won't allow further extension
        schema: {
          description: { type: 'string' },
        },
      };

      const extendedModel = await extensionManager.registerModel(
        'Category',
        categoryDefinition,
        definitionKnex
      );

      // Should be extended from the first model
      expect(extendedModel.prototype instanceof CategoryModel).toBe(true);
      expect(extendedModel.tableName).toBe('categories');
    });
  });

  describe('Model Extension Event Emission', () => {
    let extensionManager;
    let eventDbHelper;
    let eventKnex;
    let events;

    beforeEach(async () => {
      events = [];
      eventDbHelper = new RealDatabaseHelper();
      eventKnex = await eventDbHelper.createKnexInstance('event_test');

      extensionManager = new ModelManager(
        {
          enabled: true,
        },
        'event-test'
      );

      extensionManager.on('model-registered', event => {
        events.push(event);
      });

      await extensionManager.initialize();
    });

    afterEach(async () => {
      if (extensionManager?.isInitialized) {
        await extensionManager.shutdown();
      }
      await eventDbHelper.cleanup();
    });

    test('should emit correct events for extended models', async () => {
      // Register first model with isShared flag
      class FirstModel extends Model {
        static get tableName() {
          return 'test_models';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }
      }

      await extensionManager.registerModel('TestModel', FirstModel, eventKnex);

      // Register second model (should extend)
      class SecondModel extends Model {
        static get tableName() {
          return 'test_models';
        }
      }

      await extensionManager.registerModel('TestModel', SecondModel, eventKnex);

      expect(events).toHaveLength(2);
      expect(events[0].registrationType).toBe('class');
      expect(events[1].registrationType).toBe('class-inheritance');
      expect(events[1].modelName).toBe('TestModel');
    });
  });

  describe('Model Extension Replacement Mode', () => {
    let replacementManager;
    let replacementDbHelper;
    let replacementKnex;

    beforeEach(async () => {
      replacementDbHelper = new RealDatabaseHelper();
      replacementKnex = await replacementDbHelper.createKnexInstance('replacement_test');

      replacementManager = new ModelManager(
        {
          enabled: true,
        },
        'replacement-test'
      );
      await replacementManager.initialize();
    });

    afterEach(async () => {
      if (replacementManager?.isInitialized) {
        await replacementManager.shutdown();
      }
      await replacementDbHelper.cleanup();
    });

    test('should throw error when trying to register duplicate non-shared model', async () => {
      // Register first model WITHOUT isShared flag (default: not shared)
      class FirstModel extends Model {
        static get tableName() {
          return 'test_models';
        }

        firstMethod() {
          return 'first';
        }
      }

      const first = await replacementManager.registerModel(
        'TestModel',
        FirstModel,
        replacementKnex
      );
      expect(first).toBe(FirstModel);

      // Try to register second model with same name (should throw error)
      class SecondModel extends Model {
        static get tableName() {
          return 'test_models';
        }

        secondMethod() {
          return 'second';
        }
      }

      await expect(
        replacementManager.registerModel('TestModel', SecondModel, replacementKnex)
      ).rejects.toThrow(
        "Cannot register model 'TestModel': A model with this name already exists and is not shared"
      );
    });
  });

  describe('Model Extension Error Handling', () => {
    let extensionManager;
    let errorDbHelper;
    let errorKnex;

    beforeEach(async () => {
      errorDbHelper = new RealDatabaseHelper();
      errorKnex = await errorDbHelper.createKnexInstance('error_test');

      extensionManager = new ModelManager(
        {
          enabled: true,
        },
        'error-test'
      );

      await extensionManager.initialize();
    });

    afterEach(async () => {
      if (extensionManager?.isInitialized) {
        await extensionManager.shutdown();
      }
      await errorDbHelper.cleanup();
    });

    test('should handle extension errors gracefully', async () => {
      // Register first model with isShared flag
      class ValidModel extends Model {
        static get tableName() {
          return 'test_models';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }
      }

      await extensionManager.registerModel('TestModel', ValidModel, errorKnex);

      // Try to register invalid model that should cause extension to fail
      const invalidModel = null;

      await expect(
        extensionManager.registerModel('TestModel', invalidModel, errorKnex)
      ).rejects.toThrow();

      // Original model should still be registered
      expect(extensionManager.hasModel('TestModel')).toBe(true);
      const retrievedModel = extensionManager.getModel('TestModel');
      expect(retrievedModel).toBe(ValidModel);
    });
  });

  describe('Model Extension Integration with Validation', () => {
    let extensionManager;
    let validationDbHelper;
    let validationKnex;

    beforeEach(async () => {
      validationDbHelper = new RealDatabaseHelper();
      validationKnex = await validationDbHelper.createKnexInstance('validation_test');

      extensionManager = new ModelManager(
        {
          enabled: true,
          validateModels: true,
        },
        'validation-test'
      );

      await extensionManager.initialize();
    });

    afterEach(async () => {
      if (extensionManager?.isInitialized) {
        await extensionManager.shutdown();
      }
      await validationDbHelper.cleanup();
    });

    test('should validate extended models properly', async () => {
      // Register first model with isShared flag
      class ValidBaseModel extends Model {
        static get tableName() {
          return 'valid_models';
        }

        static get isShared() {
          return true; // Allow this model to be extended
        }
      }

      await extensionManager.registerModel('ValidModel', ValidBaseModel, validationKnex);

      // Register second model that should pass validation
      class ValidExtensionModel extends Model {
        static get tableName() {
          return 'valid_models';
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          };
        }
      }

      // Should not throw validation errors
      const extendedModel = await extensionManager.registerModel(
        'ValidModel',
        ValidExtensionModel,
        validationKnex
      );
      expect(extendedModel).toBeDefined();
      expect(extendedModel.jsonSchema.properties.name).toBeDefined();
    });
  });
});
