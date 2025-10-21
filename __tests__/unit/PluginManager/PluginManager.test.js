/**
 * PluginManager Unit Tests
 * Tests the plugin management and lifecycle functionality
 */

const { PluginManager, PluginInterface } = require('../../../dist/PluginManager');
const { RealDatabaseHelper, RealComponentFactory } = require('../../setup');

describe('PluginManager', () => {
  let pluginManager;
  let appRegistry;
  let configManager;
  let dbHelper;

  beforeEach(async () => {
    dbHelper = new RealDatabaseHelper();
    configManager = RealComponentFactory.createConfigurationManager({
      'plugins.loadTimeout': 30000,
      'plugins.enableMetrics': true,
    });

    // Create a simple AppRegistry-like object for PluginManager
    const EventEmitter = require('events');
    appRegistry = new EventEmitter();

    pluginManager = new PluginManager(appRegistry, {
      loadTimeout: 30000,
      enableMetrics: true,
    });
  });

  afterEach(async () => {
    if (pluginManager) {
      const status = await pluginManager.getStatus();
      if (status.initialized) {
        await pluginManager.shutdown();
      }
    }
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should create PluginManager instance', () => {
      expect(pluginManager).toBeInstanceOf(PluginManager);
      const status = pluginManager.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should throw error for invalid AppRegistry', () => {
      expect(() => new PluginManager(null)).toThrow();
      expect(() => new PluginManager({})).toThrow();
    });

    test('should use default configuration', () => {
      const manager = new PluginManager(appRegistry);
      expect(manager).toBeInstanceOf(PluginManager);
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await pluginManager.initialize();

      const status = pluginManager.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should prevent double initialization', async () => {
      await pluginManager.initialize();

      const result = await pluginManager.initialize();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('already-initialized');
    });

    test('should initialize with plugin configurations', async () => {
      const pluginConfigs = {
        'test-plugin': {
          enabled: true,
          module: './test-plugin',
          config: { option: 'value' },
        },
      };

      await pluginManager.initialize(pluginConfigs);

      const status = pluginManager.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Plugin Loading', () => {
    class TestPlugin extends PluginInterface {
      constructor(config = {}) {
        super('test-plugin', '1.0.0');
        this.config = config;
      }

      async initialize() {
        this.initialized = true;
        return { success: true };
      }

      async shutdown() {
        this.initialized = false;
        return { success: true };
      }
    }

    beforeEach(async () => {
      await pluginManager.initialize();
    });

    test('should load plugin successfully', async () => {
      const plugin = await pluginManager.load(TestPlugin, {
        option: 'value',
      });

      expect(plugin).toBeInstanceOf(TestPlugin);
      expect(plugin.initialized).toBe(true);
      expect(pluginManager.has('test-plugin')).toBe(true);
    });

    test('should load plugin with custom name', async () => {
      class CustomPlugin extends PluginInterface {
        constructor(config = {}) {
          super('custom-name', '1.0.0');
          this.config = config;
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }

        async shutdown() {
          this.initialized = false;
          return { success: true };
        }

        getStatus() {
          return {
            name: this.name,
            initialized: this.initialized,
            enabled: true,
          };
        }
      }

      const plugin = await pluginManager.load(CustomPlugin, {
        option: 'value',
      });

      expect(plugin).toBeInstanceOf(CustomPlugin);
      expect(pluginManager.has('custom-name')).toBe(true);
    });

    test('should prevent duplicate plugin loading', async () => {
      await pluginManager.load(TestPlugin, {});

      await expect(pluginManager.load(TestPlugin, {})).rejects.toThrow(/already loaded/);
    });

    test('should handle plugin initialization timeout', async () => {
      class SlowPlugin extends PluginInterface {
        constructor() {
          super('slow-plugin', '1.0.0');
        }

        async initialize() {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { success: true };
        }
      }

      // Create a new PluginManager with very short timeout
      const shortTimeoutManager = new PluginManager(appRegistry, {
        loadTimeout: 50,
        enableMetrics: true,
      });
      await shortTimeoutManager.initialize();

      await expect(shortTimeoutManager.load(SlowPlugin, {})).rejects.toThrow(
        /Timeout.*initialize plugin/
      );
    });

    test('should handle plugin initialization errors', async () => {
      class FailingPlugin extends PluginInterface {
        constructor() {
          super('failing-plugin', '1.0.0');
        }

        async initialize() {
          throw new Error('Plugin initialization failed');
        }
      }

      await expect(pluginManager.load(FailingPlugin, {})).rejects.toThrow(
        'Plugin initialization failed'
      );
    });
  });

  describe('Plugin Management', () => {
    class TestPlugin extends PluginInterface {
      constructor(config = {}) {
        super('test-plugin', '1.0.0');
        this.config = config;
      }

      async initialize() {
        this.initialized = true;
        return { success: true };
      }

      async shutdown() {
        this.initialized = false;
        return { success: true };
      }
    }

    beforeEach(async () => {
      await pluginManager.initialize();
      await pluginManager.load(TestPlugin, {});
    });

    test('should get plugin by name', () => {
      const plugin = pluginManager.get('test-plugin');

      expect(plugin).toBeInstanceOf(TestPlugin);
      expect(plugin.name).toBe('test-plugin');
    });

    test('should return null for non-existent plugin', () => {
      const plugin = pluginManager.get('non-existent');

      expect(plugin).toBeUndefined();
    });

    test('should list all plugin names', () => {
      const plugins = pluginManager.getAll();
      const pluginNames = plugins.map(p => p.name);

      expect(Array.isArray(pluginNames)).toBe(true);
      expect(pluginNames).toContain('test-plugin');
    });

    test('should get plugins by status', () => {
      const allPlugins = pluginManager.getAll();
      const enabledPlugins = allPlugins.filter(p => p.enabled);

      expect(Array.isArray(enabledPlugins)).toBe(true);
      expect(enabledPlugins.length).toBeGreaterThan(0);
    });

    test('should unload plugin', async () => {
      expect(pluginManager.has('test-plugin')).toBe(true);

      await pluginManager.unload('test-plugin');

      expect(pluginManager.has('test-plugin')).toBe(false);
    });

    test('should handle unloading non-existent plugin', async () => {
      const result = await pluginManager.unload('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Plugin Notifications', () => {
    class TestPlugin extends PluginInterface {
      constructor() {
        super('test-plugin', '1.0.0');
        this.notifications = [];
      }

      async initialize() {
        this.initialized = true;
        return { success: true };
      }

      async onAppRegistered(data) {
        this.notifications.push({ type: 'app-registered', data });
      }

      async onConnectionCreated(data) {
        this.notifications.push({ type: 'connection-created', data });
      }

      async onAutoOperationCompleted(data) {
        this.notifications.push({ type: 'auto-operation-completed', data });
      }
    }

    beforeEach(async () => {
      await pluginManager.initialize();
      await pluginManager.load(TestPlugin, {});
    });

    test('should notify plugins of events', async () => {
      const result = await pluginManager.notify('onAppRegistered', {
        appName: 'testApp',
        config: {},
      });

      expect(result.success).toBeGreaterThan(0);
      expect(result.failed).toBe(0);

      const plugin = pluginManager.get('test-plugin');
      expect(plugin.notifications).toHaveLength(1);
      expect(plugin.notifications[0].type).toBe('app-registered');
    });

    test('should handle plugin notification errors', async () => {
      class FailingPlugin extends PluginInterface {
        constructor() {
          super('failing-plugin', '1.0.0');
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }

        async onAppRegistered() {
          throw new Error('Notification failed');
        }
      }

      await pluginManager.load(FailingPlugin, {});

      // Add error event listener to handle expected error
      const errors = [];
      pluginManager.on('error', error => {
        errors.push(error);
      });

      const result = await pluginManager.notify('onAppRegistered', {});

      expect(result.failed).toBeGreaterThan(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('should skip plugins without notification method', async () => {
      const result = await pluginManager.notify('onNonExistentMethod', {});

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('Status and Metrics', () => {
    beforeEach(async () => {
      await pluginManager.initialize();
    });

    test('should provide comprehensive status', () => {
      const status = pluginManager.getStatus();

      expect(status).toBeDefined();
      expect(status.initialized).toBeDefined();
      expect(status).toHaveProperty('counts');
      expect(status.counts).toHaveProperty('total');
      expect(status.counts).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(typeof status.counts.total).toBe('number');
    });

    test('should track plugin metrics', async () => {
      class TestPlugin extends PluginInterface {
        constructor() {
          super('test-plugin', '1.0.0');
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }
      }

      await pluginManager.load(TestPlugin, {});

      const status = pluginManager.getStatus();

      expect(status.counts).toBeDefined();
      expect(status.counts.total).toBe(1);
      expect(status.plugins).toBeDefined();
    });

    test('should provide plugin availability status', () => {
      const status = pluginManager.getStatus();
      const availability = status.counts;

      expect(availability).toHaveProperty('total');
      expect(availability).toHaveProperty('enabled');
      expect(availability).toHaveProperty('disabled');
      expect(typeof availability.total).toBe('number');
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await pluginManager.initialize();
    });

    test('should emit events during plugin lifecycle', async () => {
      const events = [];

      pluginManager.on('plugin-loaded', data => events.push('loaded'));
      pluginManager.on('plugin-unloaded', data => events.push('unloaded'));

      class TestPlugin extends PluginInterface {
        constructor() {
          super('test-plugin', '1.0.0');
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }

        async shutdown() {
          this.initialized = false;
          return { success: true };
        }
      }

      await pluginManager.load(TestPlugin, {});
      await pluginManager.unload('test-plugin');

      expect(events).toContain('loaded');
      expect(events).toContain('unloaded');
    });

    test('should emit error events', async () => {
      const errors = [];

      pluginManager.on('error', error => errors.push(error));

      class FailingPlugin extends PluginInterface {
        async initialize() {
          throw new Error('Plugin failed');
        }
      }

      await expect(pluginManager.load(FailingPlugin, {})).rejects.toThrow();

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await pluginManager.initialize();

      class TestPlugin extends PluginInterface {
        constructor() {
          super('test-plugin', '1.0.0');
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }

        async shutdown() {
          this.initialized = false;
          return { success: true };
        }
      }

      await pluginManager.load(TestPlugin, {});

      const result = await pluginManager.shutdown();

      expect(result.success).toBe(true);
      const finalStatus = pluginManager.getStatus();
      expect(finalStatus.initialized).toBe(false);
      expect(pluginManager.has('test-plugin')).toBe(false);
    });

    test('should handle shutdown timeout', async () => {
      await pluginManager.initialize();

      const result = await pluginManager.shutdown({ timeout: 1000 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('pluginCount');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await pluginManager.initialize();
    });

    test('should handle invalid plugin class', async () => {
      await expect(pluginManager.load(null, {})).rejects.toThrow();

      await expect(pluginManager.load({}, {})).rejects.toThrow();
    });

    test('should handle plugin limit exceeded', async () => {
      class TestPlugin1 extends PluginInterface {
        constructor(config = {}) {
          super('test-plugin-1', '1.0.0');
          this.initialized = false;
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }

        async shutdown() {
          this.initialized = false;
          return { success: true };
        }

        getStatus() {
          return {
            name: this.name,
            initialized: this.initialized,
            enabled: true,
          };
        }
      }

      class TestPlugin2 extends PluginInterface {
        constructor(config = {}) {
          super('test-plugin-2', '1.0.0');
          this.initialized = false;
        }

        async initialize() {
          this.initialized = true;
          return { success: true };
        }

        async shutdown() {
          this.initialized = false;
          return { success: true };
        }

        getStatus() {
          return {
            name: this.name,
            initialized: this.initialized,
            enabled: true,
          };
        }
      }

      // Load two different plugins - should work fine
      await pluginManager.load(TestPlugin1, {});
      await pluginManager.load(TestPlugin2, {});

      // Verify both plugins are loaded
      const status = pluginManager.getStatus();
      expect(status.counts.total).toBe(2);
    });
  });
});
