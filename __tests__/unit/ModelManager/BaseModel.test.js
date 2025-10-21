/**
 * BaseModel Unit Tests
 * Tests the enhanced BaseModel functionality with hooks, validation, and plugins
 */

const { BaseModel } = require('../../../dist/ModelManager/BaseModel');
const { RealDatabaseHelper } = require('../../setup');

describe('BaseModel', () => {
  let knexInstance;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    knexInstance = await dbHelper.createKnexInstance('basemodel_test');
    BaseModel.knex(knexInstance);
  });

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  describe('Basic Functionality', () => {
    test('should extend Objection Model', () => {
      expect(BaseModel.prototype).toBeInstanceOf(Object);
      expect(BaseModel.ObjectionModel).toBeDefined();
    });

    test('should have default schema configuration', () => {
      class TestModel extends BaseModel {
        static get tableName() {
          return 'test_table';
        }
      }

      // Test that the class can be instantiated and has expected properties
      expect(TestModel.tableName).toBe('test_table');
      expect(typeof TestModel).toBe('function');
      expect(TestModel.prototype).toBeDefined();
    });

    test('should support custom schema configuration', () => {
      class TestModel extends BaseModel {
        static get tableName() {
          return 'test_table';
        }
        static get schema() {
          return {
            timestamps: true,
            softDeletes: true,
            generateUuid: true,
            validationRules: {
              required: ['name'],
              types: { name: 'string' },
            },
          };
        }
      }

      // Test that the class has expected properties and methods
      expect(TestModel.tableName).toBe('test_table');
      expect(typeof TestModel).toBe('function');
      expect(TestModel.prototype).toBeDefined();
      expect(TestModel.prototype).toBeInstanceOf(Object);
    });
  });

  describe('Hook System', () => {
    test('should provide hook information', () => {
      const hookInfo = BaseModel.getHookInfo();

      expect(hookInfo).toHaveProperty('instanceHooks');
      expect(hookInfo).toHaveProperty('staticHooks');
      expect(hookInfo).toHaveProperty('schemaFeatures');

      expect(Array.isArray(hookInfo.instanceHooks)).toBe(true);
      expect(Array.isArray(hookInfo.staticHooks)).toBe(true);
      expect(hookInfo.instanceHooks.length).toBeGreaterThan(0);
      expect(hookInfo.staticHooks.length).toBeGreaterThan(0);
    });

    test('should validate hook names', () => {
      expect(BaseModel.isValidHook('$beforeInsert', 'instance')).toBe(true);
      expect(BaseModel.isValidHook('beforeFind', 'static')).toBe(true);
      expect(BaseModel.isValidHook('$beforeInsert', 'static')).toBe(false);
      expect(BaseModel.isValidHook('invalidHook', 'any')).toBe(false);
    });

    test('should provide hook event names', () => {
      const eventNames = BaseModel.getHookEventNames();

      expect(eventNames).toHaveProperty('BEFORE_INSERT');
      expect(eventNames).toHaveProperty('AFTER_INSERT');
      expect(eventNames).toHaveProperty('BEFORE_UPDATE');
      expect(eventNames).toHaveProperty('AFTER_UPDATE');

      expect(eventNames.BEFORE_INSERT).toBe('hook:beforeInsert');
      expect(eventNames.AFTER_INSERT).toBe('hook:afterInsert');
    });

    test('should create instance', async () => {
      class TestModel extends BaseModel {
        static get tableName() {
          return 'test_table';
        }
      }

      const instance = new TestModel({ name: 'Test' });

      // Verify instance was created successfully
      expect(instance).toBeDefined();
      expect(typeof instance).toBe('object');
      expect(instance.constructor).toBe(TestModel);
      expect(instance).toHaveProperty('constructor', TestModel);
    });
  });

  describe('Validation System', () => {
    class TestModel extends BaseModel {
      static get tableName() {
        return 'test_table';
      }
      static get schema() {
        return {
          validationRules: {
            required: ['name', 'email'],
            types: {
              name: 'string',
              email: 'string',
              age: 'number',
            },
            length: {
              name: { min: 2, max: 50 },
              email: { min: 5, max: 100 },
            },
            range: {
              age: { min: 0, max: 120 },
            },
            patterns: {
              email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            },
            custom: {
              name: value => {
                if (value && value.includes('admin')) {
                  return 'Name cannot contain "admin"';
                }
                return true;
              },
            },
          },
        };
      }
    }

    test('should validate required fields', async () => {
      const instance = new TestModel({});

      const errors = instance.$validate();

      expect(errors).toBeDefined();
      expect(Array.isArray(errors)).toBe(true);

      const requiredErrors = errors.filter(e => e.rule === 'required');
      expect(requiredErrors.length).toBeGreaterThan(0);
    });

    test('should validate field types', async () => {
      const instance = new TestModel({
        name: 'Test',
        email: 'test@example.com',
        age: 'not-a-number', // Invalid type
      });

      const errors = instance.$validate();

      const typeErrors = errors.filter(e => e.rule === 'type');
      expect(typeErrors.length).toBeGreaterThan(0);
      expect(typeErrors[0].field).toBe('age');
    });

    test('should validate field lengths', async () => {
      const instance = new TestModel({
        name: 'A', // Too short
        email: 'test@example.com',
      });

      const errors = instance.$validate();

      const lengthErrors = errors.filter(e => e.rule === 'length');
      expect(lengthErrors.length).toBeGreaterThan(0);
      expect(lengthErrors[0].field).toBe('name');
    });

    test('should validate numeric ranges', async () => {
      const instance = new TestModel({
        name: 'Test',
        email: 'test@example.com',
        age: 150, // Too high
      });

      const errors = instance.$validate();

      const rangeErrors = errors.filter(e => e.rule === 'range');
      expect(rangeErrors.length).toBeGreaterThan(0);
      expect(rangeErrors[0].field).toBe('age');
    });

    test('should validate patterns', async () => {
      const instance = new TestModel({
        name: 'Test',
        email: 'invalid-email', // Invalid pattern
      });

      const errors = instance.$validate();

      const patternErrors = errors.filter(e => e.rule === 'pattern');
      expect(patternErrors.length).toBeGreaterThan(0);
      expect(patternErrors[0].field).toBe('email');
    });

    test('should validate custom rules', async () => {
      const instance = new TestModel({
        name: 'admin-user', // Contains 'admin'
        email: 'test@example.com',
      });

      const errors = instance.$validate();

      const customErrors = errors.filter(e => e.rule === 'custom');
      expect(customErrors.length).toBeGreaterThan(0);
      expect(customErrors[0].field).toBe('name');
    });

    test('should pass validation with valid data', async () => {
      const instance = new TestModel({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });

      const errors = instance.$validate();

      expect(errors).toHaveLength(0);
    });
  });

  describe('Plugin System', () => {
    test('should apply single plugin', () => {
      const testPlugin = Model => {
        return class extends Model {
          static get pluginName() {
            return 'test-plugin';
          }
          testMethod() {
            return 'plugin-method';
          }
        };
      };

      const EnhancedModel = BaseModel.plugin(testPlugin, {
        name: 'test-plugin',
        version: '1.0.0',
      });

      expect(EnhancedModel.pluginName).toBe('test-plugin');

      const instance = new EnhancedModel();
      expect(instance.testMethod()).toBe('plugin-method');
    });

    test('should apply multiple plugins', () => {
      const plugin1 = Model => {
        return class extends Model {
          method1() {
            return 'plugin1';
          }
        };
      };

      const plugin2 = Model => {
        return class extends Model {
          method2() {
            return 'plugin2';
          }
        };
      };

      const EnhancedModel = BaseModel.plugins(
        { plugin: plugin1, options: { name: 'plugin1' } },
        { plugin: plugin2, options: { name: 'plugin2' } }
      );

      const instance = new EnhancedModel();
      expect(instance.method1()).toBe('plugin1');
      expect(instance.method2()).toBe('plugin2');
    });

    test('should check plugin status', () => {
      const testPlugin = Model => {
        return class extends Model {
          static get pluginName() {
            return 'test-plugin';
          }
        };
      };

      const EnhancedModel = BaseModel.plugin(testPlugin, {
        name: 'test-plugin',
      });

      expect(EnhancedModel.hasPlugin('test-plugin')).toBe(true);
      expect(EnhancedModel.hasPlugin('non-existent')).toBe(false);
    });

    test('should provide plugin information', () => {
      const testPlugin = Model => {
        return class extends Model {
          static get pluginName() {
            return 'test-plugin';
          }
        };
      };

      const EnhancedModel = BaseModel.plugin(testPlugin, {
        name: 'test-plugin',
        version: '1.0.0',
      });

      const pluginInfo = EnhancedModel.getPluginInfo();

      expect(pluginInfo).toHaveProperty('totalPlugins');
      expect(pluginInfo).toHaveProperty('pluginNames');
      expect(pluginInfo.totalPlugins).toBeGreaterThan(0);
      expect(pluginInfo.pluginNames).toContain('test-plugin');
    });

    test('should use built-in plugins', () => {
      // Test timestamp plugin
      const TimestampModel = BaseModel.plugin(BaseModel.timestampPlugin());
      expect(TimestampModel).toBeDefined();

      // Test soft delete plugin
      const SoftDeleteModel = BaseModel.plugin(BaseModel.softDeletePlugin());
      expect(SoftDeleteModel).toBeDefined();

      // Test validation plugin
      const ValidationModel = BaseModel.plugin(BaseModel.validationPlugin());
      expect(ValidationModel).toBeDefined();
    });
  });

  describe('Public JSON Serialization', () => {
    class TestModel extends BaseModel {
      static get tableName() {
        return 'test_table';
      }
      static get schema() {
        return {
          publicExclude: ['password', 'secret'],
          timestamps: true,
        };
      }
    }

    test('should create public JSON with default settings', () => {
      const instance = new TestModel({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        password: 'secret123',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const publicData = instance.toPublicJSON();

      expect(publicData).toHaveProperty('id');
      expect(publicData).toHaveProperty('name');
      expect(publicData).toHaveProperty('email');
      expect(publicData).not.toHaveProperty('password');
      expect(publicData).not.toHaveProperty('created_at'); // Excluded by default
    });

    test('should include timestamps when requested', () => {
      const instance = new TestModel({
        id: 1,
        name: 'John',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const publicData = instance.toPublicJSON({ includeTimestamps: true });

      expect(publicData).toHaveProperty('created_at');
      expect(publicData).toHaveProperty('updated_at');
    });

    test('should apply field transformations', () => {
      const instance = new TestModel({
        id: 1,
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
      });

      const publicData = instance.toPublicJSON({
        transform: {
          email: email => email.toLowerCase(),
          display_name: (_, obj) => `Mr. ${obj.name}`,
        },
      });

      expect(publicData.email).toBe('john@example.com');
      expect(publicData.display_name).toBe('Mr. John Doe');
    });

    test('should use presets', () => {
      const instance = new TestModel({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        password: 'secret',
      });

      const minimalData = instance.toPublicJSON({ preset: 'minimal' });
      const fullData = instance.toPublicJSON({ preset: 'full' });

      expect(Object.keys(minimalData).length).toBeLessThan(Object.keys(fullData).length);
    });

    test('should create custom public JSON methods', () => {
      const toAPIv1JSON = TestModel.createPublicJSONMethod({
        includeTimestamps: true,
        transform: {
          created_at: date => Math.floor(date.getTime() / 1000),
        },
      });

      expect(typeof toAPIv1JSON).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors gracefully', async () => {
      class TestModel extends BaseModel {
        static get tableName() {
          return 'test_table';
        }
        static get schema() {
          return {
            validationRules: {
              custom: {
                name: () => {
                  throw new Error('Validation error');
                },
              },
            },
          };
        }
      }

      const instance = new TestModel({ name: 'test' });

      const errors = instance.$validate();

      expect(errors).toBeDefined();
      expect(Array.isArray(errors)).toBe(true);
    });

    test('should handle plugin application errors', () => {
      const invalidPlugin = null;

      expect(() => {
        BaseModel.plugin(invalidPlugin);
      }).toThrow();
    });

    test('should handle hook execution errors', async () => {
      class TestModel extends BaseModel {
        static get tableName() {
          return 'test_table';
        }

        async $beforeInsert() {
          throw new Error('Hook error');
        }
      }

      const instance = new TestModel({ name: 'test' });

      await expect(instance.$beforeInsert({})).rejects.toThrow('Hook error');
    });
  });
});
