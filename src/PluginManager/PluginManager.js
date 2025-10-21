import { EventEmitter } from 'events';
import { mergeConfig } from '../ConfigurationManager';
import { TimeoutManager } from '../TimeoutManager';

/**
 * Type guard to check if an object is an EventEmitter or EventEmitter-like object.
 *
 * This function validates whether the provided object either:
 * 1. Extends from EventEmitter (instanceof check), OR
 * 2. Implements the EventEmitter interface (duck typing)
 *
 * The duck typing check validates the presence of core EventEmitter methods:
 * - emit(): Trigger events
 * - on(): Register event listeners
 * - once(): Register one-time event listeners
 * - off() or removeListener(): Unregister event listeners
 *
 * @param {unknown} obj - The object to check
 * @returns {Boolean} True if the object is an EventEmitter or implements its interface
 */
function isEventEmitter(obj) {
  // Check if it's an actual EventEmitter instance
  if (obj instanceof EventEmitter) {
    return true;
  }

  // Duck typing check for EventEmitter-like objects
  return (
    obj != null &&
    typeof obj === 'object' &&
    typeof obj.emit === 'function' &&
    typeof obj.on === 'function' &&
    typeof obj.once === 'function' &&
    (typeof obj.off === 'function' || typeof obj.removeListener === 'function')
  );
}

/**
 * Plugin Manager for rapid-objection pluggable architecture
 *
 * Manages the lifecycle of plugins, provides plugin loading/unloading,
 * and coordinates plugin lifecycle hooks with AppRegistry events.
 */
export class PluginManager extends EventEmitter {
  /** @type {boolean} */
  #initialized = false;

  /** @type {Map<string, PluginInterface>} */
  #plugins = new Map();

  /** @type {AppRegistry} */
  #appRegistry = null;

  /** @type {Object} */
  #config = null;

  /**
   * Create a new PluginManager instance
   *
   * @param {AppRegistry} appRegistry - The AppRegistry instance
   * @param {Object} config - Plugin configuration
   */
  constructor(appRegistry, config = {}) {
    super();

    // Validate that appRegistry has required methods (duck typing)
    if (!isEventEmitter(appRegistry)) {
      throw new Error('AppRegistry instance is required');
    }

    this.#appRegistry = appRegistry;
    this.#config = mergeConfig(
      {
        loadTimeout: 30000, // Timeout for plugin loading in milliseconds
        shutdownTimeout: 15000, // Timeout for plugin shutdown in milliseconds
      },
      config
    );
  }

  /**
   * Initialize the plugin manager
   *
   * @param {Object} [options={}] - Initialization options (reserved for future use)
   * @returns {Promise<Object>} Initialization result with success status and plugin count
   * @throws {Error} When initialization fails or plugin manager already initialized
   */
  async initialize(_options = {}) {
    if (this.#initialized) {
      this.#emitWarning('initialize', {}, 'PluginManager already initialized');
      return { success: true, mode: 'already-initialized' };
    }

    this.#initialized = true;

    try {
      // Initialize configured plugins with optimized batch processing
      const pluginResults = await this.#initializeConfiguredPlugins();
      const { loadedPlugins, failedPlugins } = pluginResults;

      const result = {
        success: true,
        pluginCount: this.#plugins.size,
        loadedPlugins,
        failedPlugins,
        timestamp: new Date(),
      };

      this.emit('initialized', result);
      return result;
    } catch (error) {
      this.#initialized = false;
      this.#emitError('initialize', {}, error);
      throw error;
    }
  }

  /**
   * Load a plugin into the system
   *
   * @param {Function} PluginClass - Plugin class constructor (recommended) or plugin instance
   * @param {Object} config - Plugin configuration
   * @returns {Promise<Object>} The loaded plugin instance
   * @throws {Error} When plugin loading fails
   */
  async load(PluginClass, config = {}) {
    const startTime = Date.now();

    try {
      // Create plugin instance from class constructor
      let plugin;

      if (typeof PluginClass === 'function') {
        try {
          plugin = new PluginClass(config);
        } catch (constructorError) {
          throw new Error(`Failed to instantiate plugin class: ${constructorError.message}`);
        }
      } else if (PluginClass && typeof PluginClass === 'object') {
        // Handle case where an instance was passed (though not recommended)
        plugin = PluginClass;
      } else {
        throw new Error('Plugin must be a class constructor function');
      }

      // Validate plugin implements required interface
      this.#validatePlugin(plugin);

      // Check for duplicate plugin names
      if (this.#plugins.has(plugin.name)) {
        throw new Error(`Plugin '${plugin.name}' is already loaded`);
      }

      // Validate plugin configuration
      if (typeof plugin.validateConfiguration === 'function') {
        await plugin.validateConfiguration(config);
      }

      // Initialize plugin with timeout protection
      await TimeoutManager.withTimeout(
        () => plugin.initialize(this.#appRegistry, config),
        this.#config.loadTimeout,
        {
          operation: `initialize plugin '${plugin.name}'`,
          component: 'PluginManager',
          cleanup: () => {
            // Mark plugin as failed if timeout occurs
            plugin.enabled = false;
            plugin.initialized = false;
          },
        }
      );

      plugin.enabled = true;
      plugin.initialized = true;

      // Store plugin
      this.#plugins.set(plugin.name, plugin);

      const loadTime = Date.now() - startTime;

      this.emit('plugin-loaded', {
        name: plugin.name,
        version: plugin.version,
        config,
        loadTime,
        timestamp: new Date(),
      });

      return plugin;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const pluginName = PluginClass?.name || 'unknown';

      this.#emitError('load-plugin', { pluginName, loadTime }, error);
      throw new Error(`Failed to load plugin: ${error.message}`);
    }
  }

  /**
   * Unload a plugin from the system
   *
   * @param {string} pluginName - Name of the plugin to unload
   * @returns {Promise<boolean>} True if plugin was unloaded, false if not found
   * @throws {Error} When plugin unloading fails
   */
  async unload(pluginName) {
    const plugin = this.#plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    try {
      // Shutdown plugin with timeout protection
      await TimeoutManager.withTimeout(
        () => plugin.shutdown(),
        this.#config.shutdownTimeout, // Use dedicated shutdown timeout
        {
          operation: `shutdown plugin '${pluginName}'`,
          component: 'PluginManager',
          cleanup: () => {
            // Force cleanup if shutdown times out
            plugin.enabled = false;
            plugin.initialized = false;
          },
        }
      );

      plugin.enabled = false;
      plugin.initialized = false;

      // Remove from registry
      this.#plugins.delete(pluginName);

      this.emit('plugin-unloaded', {
        name: pluginName,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      this.#emitError('unload-plugin', { pluginName }, error);
      throw new Error(`Failed to unload plugin '${pluginName}': ${error.message}`);
    }
  }

  /**
   * Get a specific plugin by name
   *
   * @param {string} name - Plugin name
   * @returns {PluginInterface|undefined} The plugin instance or undefined
   */
  get(name) {
    return this.#plugins.get(name);
  }

  /**
   * Get all loaded plugins
   *
   * @returns {PluginInterface[]} Array of all loaded plugins
   */
  getAll() {
    return Array.from(this.#plugins.values());
  }

  /**
   * Check if a plugin exists
   *
   * @param {string} name - Plugin name
   * @returns {boolean} True if plugin exists
   */
  has(name) {
    return this.#plugins.has(name);
  }

  /**
   * Get plugin status information
   *
   * @returns {Object} Plugin manager status
   */
  getStatus() {
    const plugins = this.getAll();
    const enabledPlugins = plugins.filter(p => p.enabled);
    const initializedPlugins = plugins.filter(p => p.initialized);

    return {
      initialized: this.#initialized,
      config: {
        loadTimeout: this.#config.loadTimeout,
        shutdownTimeout: this.#config.shutdownTimeout,
      },
      counts: {
        total: plugins.length,
        enabled: enabledPlugins.length,
        disabled: plugins.length - enabledPlugins.length,
        initialized: initializedPlugins.length,
      },
      plugins: plugins.map(p => p.getStatus()),
      timestamp: new Date(),
    };
  }

  /**
   * Notify all plugins of a lifecycle event
   *
   * @param {string} event - Event name (method name on plugin)
   * @param {...any} args - Arguments to pass to plugin method
   * @returns {Promise<Object>} Notification results with success/failure counts
   */
  async notify(event, ...args) {
    if (!this.#initialized) {
      return { success: 0, failed: 0, skipped: 0 };
    }

    const eligiblePlugins = [];
    const promises = [];
    let skipped = 0;

    // Filter eligible plugins and create promises
    for (const plugin of this.#plugins.values()) {
      try {
        if (!plugin.enabled || !plugin.initialized) {
          skipped++;
          continue;
        }

        if (typeof plugin[event] !== 'function') {
          skipped++;
          continue;
        }

        // Add eligible plugins to the list
        eligiblePlugins.push(plugin);

        // Add promises to the list
        promises.push(plugin[event](...args));
      } catch (error) {
        // Synchronous error in plugin method call
        this.#emitError(
          'plugin-notification',
          { pluginName: plugin.name, event, type: 'synchronous' },
          error
        );
        promises.push(Promise.reject(error));
      }
    }

    // Wait for all plugin notifications to complete
    const results = await Promise.allSettled(promises);

    let success = 0;
    let failed = 0;

    // Process results and emit events for failures
    results.forEach((result, index) => {
      try {
        const plugin = eligiblePlugins[index];

        if (result.status === 'fulfilled') {
          success++;
        } else {
          failed++;
          const errorObj = new Error(result.reason?.message || 'Unknown error');
          this.#emitError(
            'plugin-notification',
            { pluginName: plugin?.name || 'unknown', event, type: 'asynchronous' },
            errorObj
          );
        }
      } catch (error) {
        // Error during result processing
        failed++;
        this.#emitError(
          'plugin-notification',
          { pluginName: 'unknown', event, type: 'result-processing' },
          error
        );
      }
    });

    const summary = { success, failed, skipped };

    // Emit summary event (with error handling)
    try {
      this.emit('plugin-notification-completed', {
        event,
        summary,
        timestamp: new Date(),
      });
    } catch (error) {
      // Error during event emission - log but don't fail
      this.#emitError('plugin-notification', { event, type: 'event-emission' }, error);
    }

    return summary;
  }

  /**
   * Emit error event with consistent structure for monitoring and debugging.
   * Includes plugin manager context, phase, and timestamp for comprehensive error tracking.
   * Used internally by all methods for standardized error reporting.
   *
   * @private
   * @param {string} phase - The phase/operation where error occurred
   * @param {Object} context - Additional context information
   * @param {Error} error - The error that occurred
   */
  #emitError(phase, context, error) {
    this.emit('error', {
      phase,
      component: 'PluginManager',
      error: error.message,
      timestamp: new Date(),
      ...context,
    });
  }

  /**
   * Emit warning event with consistent structure for monitoring and debugging.
   * Includes plugin manager context, phase, and timestamp for comprehensive warning tracking.
   * Used internally for non-fatal issues that should be logged.
   *
   * @private
   * @param {string} phase - The phase/operation where warning occurred
   * @param {Object} context - Additional context information
   * @param {string} message - The warning message
   */
  #emitWarning(phase, context, message) {
    this.emit('warning', {
      phase,
      component: 'PluginManager',
      message,
      timestamp: new Date(),
      ...context,
    });
  }

  /**
   * Initialize configured plugins with optimized batch processing and error handling
   *
   * @private
   * @returns {Promise<Object>} Plugin initialization results with loaded and failed plugins
   */
  async #initializeConfiguredPlugins() {
    const loadedPlugins = [];
    const failedPlugins = [];
    const pluginEntries = Object.entries(this.#config || {});

    // Filter enabled plugins upfront
    const enabledPlugins = pluginEntries.filter(([, config]) => config.enabled);

    if (enabledPlugins.length === 0) {
      return { loadedPlugins, failedPlugins };
    }

    // Process plugins with controlled concurrency (max 3 concurrent loads)
    const concurrencyLimit = Math.min(3, enabledPlugins.length);
    const pluginChunks = this.#chunkArray(enabledPlugins, concurrencyLimit);

    for (const chunk of pluginChunks) {
      const chunkPromises = chunk.map(([pluginName, pluginConfig]) =>
        this.#loadConfiguredPlugin(pluginName, pluginConfig)
      );

      const chunkResults = await Promise.allSettled(chunkPromises);

      chunkResults.forEach((result, index) => {
        const [pluginName] = chunk[index];

        if (result.status === 'fulfilled') {
          loadedPlugins.push(pluginName);
        } else {
          const error = result.reason;
          failedPlugins.push({ name: pluginName, error: error.message });
          this.#emitWarning(
            'plugin-loading',
            { pluginName },
            `Failed to load plugin ${pluginName}: ${error.message}`
          );
        }
      });
    }

    return { loadedPlugins, failedPlugins };
  }

  /**
   * Load a single configured plugin with timeout protection
   *
   * @private
   * @param {string} pluginName - Name of the plugin to load
   * @param {Object} pluginConfig - Plugin configuration
   * @returns {Promise<void>}
   * @throws {Error} When plugin loading fails
   */
  async #loadConfiguredPlugin(pluginName, pluginConfig) {
    return await TimeoutManager.withTimeout(
      async () => {
        // Validate plugin configuration
        if (!pluginConfig.module) {
          throw new Error(`Plugin '${pluginName}' missing required 'module' property`);
        }

        // Dynamic import with error context
        let PluginClass;
        try {
          const imported = await import(pluginConfig.module);
          PluginClass = imported.default || imported[pluginName] || imported;
        } catch (importError) {
          throw new Error(
            `Failed to import plugin module '${pluginConfig.module}': ${importError.message}`
          );
        }

        // Load plugin with configuration
        await this.load(PluginClass, pluginConfig.config || {});
      },
      this.#config.loadTimeout * 2, // Extended timeout for import + initialization
      {
        operation: `load configured plugin '${pluginName}'`,
        component: 'PluginManager',
        cleanup: () => {
          // Cleanup any partial plugin state on timeout
          if (this.#plugins.has(pluginName)) {
            this.#plugins.delete(pluginName);
          }
        },
      }
    );
  }

  /**
   * Split array into chunks of specified size
   *
   * @private
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array[]} Array of chunks
   */
  #chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Validate that a plugin implements the required interface
   *
   * @param {any} plugin - Plugin to validate
   * @throws {Error} If plugin is invalid
   * @private
   */
  #validatePlugin(plugin) {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Plugin must be an object');
    }

    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a valid name property');
    }

    if (typeof plugin.initialize !== 'function') {
      throw new Error('Plugin must implement initialize() method');
    }

    if (typeof plugin.shutdown !== 'function') {
      throw new Error('Plugin must implement shutdown() method');
    }

    if (typeof plugin.getStatus !== 'function') {
      throw new Error('Plugin must implement getStatus() method');
    }
  }

  /**
   * Shutdown all plugins
   *
   * @param {Object} [options={}] - Shutdown options
   * @param {number} [options.timeout=15000] - Timeout for plugin shutdown operations
   * @returns {Promise<Object>} Shutdown result with success status and plugin count
   * @throws {Error} When shutdown process encounters critical errors
   */
  async shutdown(options = {}) {
    const { timeout = this.#config.shutdownTimeout } = options;

    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('shutdown', {}, 'PluginManager already shut down');
      return { success: false, reason: 'already-shutdown' };
    }

    this.#initialized = false;

    try {
      const shutdownPromises = [];
      const shutdownErrors = [];
      const shutdownPlugins = [];

      for (const [pluginName, plugin] of this.#plugins.entries()) {
        if (plugin.enabled) {
          shutdownPlugins.push(pluginName);
          shutdownPromises.push(
            this.unload(pluginName).catch(error => {
              shutdownErrors.push({ name: pluginName, error: error.message });
              this.#emitError('plugin-shutdown', { pluginName }, error);
            })
          );
        }
      }

      // Use timeout for the entire shutdown process
      await TimeoutManager.withTimeout(() => Promise.allSettled(shutdownPromises), timeout, {
        operation: 'shutdown all plugins',
        component: 'PluginManager',
      });

      // Clear all state
      this.#plugins.clear();

      const result = {
        success: true,
        pluginCount: shutdownPlugins.length,
        shutdownPlugins,
        shutdownErrors,
        timestamp: new Date(),
      };

      this.emit('shutdown-completed', result);
      this.removeAllListeners();

      return result;
    } catch (error) {
      // Restore initialized state on error
      this.#initialized = true;

      this.#emitError('shutdown', {}, error);
      throw error;
    }
  }
}
