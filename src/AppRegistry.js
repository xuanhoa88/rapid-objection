import { EventEmitter } from 'events';
import { ConnectionManager } from './ConnectionManager';
import { ConfigurationManager, mergeConfig } from './ConfigurationManager';
import { TimeoutManager } from './TimeoutManager';
import { PluginManager } from './PluginManager';
import { overrideComponents } from './overrideComponents';

// Default component classes registry for AppRegistry
const COMPONENT_CLASSES = {
  ConnectionManager,
  ConfigurationManager,
  TimeoutManager,
  PluginManager,
};

/**
 * App Registry for managing multiple connection instances
 *
 * @extends EventEmitter
 */
export class AppRegistry extends EventEmitter {
  /** @type {boolean} */
  #initialized = false;

  /** @type {Map<string, ConnectionManager>} */
  #connectionInstances = new Map();

  // Track shared connection references to prevent memory leaks
  #sharedConnections = new Map(); // connectionId -> Set of appNames using it

  /** @type {ConfigurationManager} */
  #configManager = null;

  /** @type {PluginManager} */
  #pluginManager = null;

  /** @type {NodeJS.Timeout|null} */
  #healthCheckInterval = null;

  /**
   * Create a new AppRegistry instance
   *
   * @param {Object} [config={}] - Registry configuration applied to all apps
   */
  constructor(config = {}) {
    super();

    // Initialize centralized configuration manager using overridden component
    this.#configManager = new COMPONENT_CLASSES.ConfigurationManager(config);

    // Validate and set defaults for configuration
    this.#validateConfiguration();
  }

  /**
   * Ensure registry is initialized
   *
   * @private
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('AppRegistry not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if AppRegistry is initialized
   *
   * @returns {boolean} True if initialized
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Initialize the AppRegistry and optional components
   * Handles orchestration of shared components across all apps
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#initialized) {
      this.#emitWarning('AppRegistry is already initialized', {
        phase: 'initialize',
      });
      return;
    }

    try {
      this.#initialized = true;

      // Initialize components for orchestration (includes plugin manager)
      await this.#initializeComponents();

      // Initialize enhanced system health monitoring
      this.#initializeSystemHealthMonitoring();

      this.emit('initialized', {
        config: this.#configManager.getAll(),
        timestamp: new Date(),
      });
    } catch (error) {
      this.#initialized = false;
      this.#emitError(`Failed to initialize AppRegistry: ${error.message}`, {
        phase: 'initialize',
        error: error.message,
      });
      throw new Error(`Failed to initialize AppRegistry: ${error.message}`);
    }
  }

  /**
   * Get shared component definitions
   *
   * @returns {Array} Array of component definitions
   * @private
   */
  #getComponents() {
    return [
      {
        field: '#pluginManager',
        create: () => new COMPONENT_CLASSES.PluginManager(this, this.#configManager.get('plugins')),
        set: instance => (this.#pluginManager = instance),
        isEnabled: () => true, // Plugin manager is always enabled
      },
    ];
  }

  /**
   * Initialize optional shared components for app orchestration
   *
   * @private
   */
  async #initializeComponents() {
    const components = this.#getComponents();

    for (const component of components) {
      try {
        if (component.isEnabled()) {
          const instance = component.create();

          // Initialize if it has an initialize method
          await instance.initialize();

          // Use set function if provided, otherwise use bracket notation
          if (component.set) {
            component.set(instance);
          } else {
            this[component.field] = instance;
          }

          this.emit('component-initialized', {
            component: component.field,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        // Log warning but continue - optional components can fail gracefully
        this.#emitWarning('Failed to initialize optional component', {
          phase: 'component-initialization',
          component: component.field,
          error: error.message,
        });
      }
    }
  }

  /**
   * Register a new app with its own connection
   *
   * Creates a new ConnectionManager instance with database connection, initializes all components,
   * and optionally auto-executes migrations, seeds, and model registration based on configuration.
   *
   * @param {string} appName - Unique app name
   * @param {Object} [initialConfig={}] - App-specific configuration
   * @param {boolean} [initialConfig.useConnection] - Reuse existing connection
   * @param {Object} [initialConfig.database] - Database connection configuration
   * @param {Object} [initialConfig.migrations] - Migration configuration
   * @param {boolean} [initialConfig.migrations.enabled] - Enable auto-migration execution
   * @param {Object} [initialConfig.seeds] - Seed configuration
   * @param {boolean} [initialConfig.seeds.enabled] - Enable auto-seed execution
   * @param {Object} [initialConfig.models] - Model configuration
   * @param {boolean} [initialConfig.models.enabled] - Enable auto-model registration
   * @param {Object} [initialConfig.models.definitions] - Model definitions to register
   * @param {Function} [initialConfig.models.BaseModel] - Custom BaseModel class
   * @param {string} [initialConfig.cwd] - Current working directory for the app
   * @returns {Promise<ConnectionManager>} The created ConnectionManager instance with auto-operations completed
   * @throws {Error} When app already exists, configuration is invalid, or auto-operations fail
   */
  async registerApp(appName, initialConfig = {}) {
    this.#ensureInitialized();

    // Check if app already exists
    if (this.#connectionInstances.has(appName)) {
      const error = new Error(`App '${appName}' is already registered`);
      error.APP_EXISTS = true;
      throw error;
    }

    try {
      // Validate app name
      if (!appName || typeof appName !== 'string' || appName.trim() === '') {
        throw new Error('App name must be a non-empty string');
      }

      // Merge global and app-specific configuration
      const { useConnection, ...config } = mergeConfig(
        { appName },
        this.#configManager.getAll(),
        initialConfig
      );

      // Validate configuration - must have database config unless reusing connection
      if (!useConnection) {
        if (!config.database || typeof config.database !== 'object') {
          throw new Error(
            'Database configuration is required when not reusing an existing connection'
          );
        }

        // Check for required database properties
        const hasClient = config.database.client && typeof config.database.client === 'string';
        const hasConnection =
          config.database.connection && typeof config.database.connection === 'object';

        if (!hasClient && !hasConnection) {
          throw new Error(
            'Database configuration must include either "client" or "connection" property'
          );
        }
      }

      // Notify plugins that app registration is starting
      await this.#notifyPlugins('onAppRegistrationStarted', appName, config);

      // Handle connection inheritance/reuse
      const { connection } = await this.#handleConnectionReuse(appName, useConnection, config);

      // Execute auto-operations for both new and reused connections
      await this.#runAutoOperations(connection, appName, config);

      // Notify plugins of app registration
      await this.#notifyPlugins('onAppRegistered', appName, connection, config);

      // Communication setup is now handled at ConnectionManager level
      this.emit('app-registered', {
        appName,
        connection,
        timestamp: new Date(),
      });

      return connection;
    } catch (error) {
      // Cleanup on failure (only if not already exists error)
      if (!error.APP_EXISTS) {
        await this.#cleanupAppState(appName, {
          skipRollback: true, // Skip rollback during registration failure
          forceCleanup: true, // Force cleanup even on errors
        });
      }

      // Notify plugins of operation failure
      await this.#notifyPlugins('onOperationFailed', appName, 'app-registration', error, {
        phase: 'app-registration',
        appName,
        error: error.message,
      });

      this.#emitError(`Failed to register app '${appName}': ${error.message}`, {
        phase: 'app-registration',
        appName,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Unregister a app and cleanup its resources
   *
   * @param {string} appName - App name to unregister
   * @param {Object} [options={}] - Unregistration options
   * @param {number} [options.timeout=30000] - Shutdown timeout in milliseconds
   * @param {boolean} [options.skipRollback=false] - Skip rollback operations
   * @param {boolean} [options.forceCleanup=false] - Force cleanup even on errors
   * @returns {Promise<boolean>} True if app was unregistered, false if not found
   */
  async unregisterApp(appName, options = {}) {
    this.#ensureInitialized();

    const {
      timeout = this.#configManager.get('registry.shutdownTimeout'),
      skipRollback = false,
      forceCleanup = false,
    } = options;

    const connection = this.#connectionInstances.get(appName);
    if (!connection) {
      throw new Error(`App '${appName}' is not registered`);
    }

    try {
      // Notify plugins that app unregistration is starting
      await this.#notifyPlugins('onAppUnregistrationStarted', appName, options);

      // Perform cleanup with rollback, connection shutdown, and plugin notifications
      await this.#cleanupAppState(appName, {
        skipRollback, // Perform full rollback during unregistration
        forceCleanup, // Force cleanup even on rollback errors
        timeout, // Pass timeout for connection shutdown
      });

      // Notify plugins that app unregistration has completed successfully (after cleanup)
      await this.#notifyPlugins('onAppUnregistered', appName, options);

      this.emit('app-unregistered', {
        appName,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      // Notify plugins of unregistration failure
      await this.#notifyPlugins('onOperationFailed', appName, 'app-unregistration', error, {
        phase: 'app-unregistration',
        appName,
        error: error.message,
      });

      this.#emitError(`Failed to unregister app '${appName}': ${error.message}`, {
        phase: 'app-unregistration',
        appName,
        error: error.message,
      });

      return false;
    }
  }

  /**
   * Get a registered app's ConnectionManager
   *
   * @param {string} appName - App name
   * @returns {ConnectionManager|undefined} The ConnectionManager instance or undefined
   */
  getApp(appName) {
    return this.#connectionInstances.get(appName);
  }

  /**
   * Check if an app is registered
   *
   * @param {string} appName - App name to check
   * @returns {boolean} True if app is registered, false otherwise
   */
  hasApp(appName) {
    return this.#connectionInstances.has(appName);
  }

  /**
   * Get comprehensive status of the AppRegistry
   *
   * @returns {Promise<Object>} Comprehensive status information following established patterns
   */
  async getStatus() {
    const connectionStatuses = await this.#getConnectionStatuses();
    const components = await this.#getComponentStatuses();
    const healthSummary = await this.#calculateEnhancedHealthSummary(connectionStatuses);

    return {
      // Core and operational state
      initialized: this.#initialized,

      // Comprehensive health information combining monitoring state and connection health
      health: {
        // Monitoring state
        monitoring: {
          active: Boolean(this.#healthCheckInterval),
          enabled: this.#configManager.get('registry.enableHealthMonitoring'),
          interval: this.#configManager.get('registry.healthCheckInterval'),
          performanceThreshold: this.#configManager.get('registry.healthPerformanceThreshold'),
        },

        // Connection health summary
        connections: {
          healthy: healthSummary.healthy,
          degraded: healthSummary.degraded,
          unhealthy: healthSummary.unhealthy,
          timeout: healthSummary.timeout,
          unknown: healthSummary.unknown,
          total: this.#connectionInstances.size,
        },

        // Overall health metrics and calculated values
        metrics: {
          averageHealthScore: healthSummary.averageHealthScore,
          healthPercentage:
            this.#connectionInstances.size > 0
              ? Math.round((healthSummary.healthy / this.#connectionInstances.size) * 100)
              : 100,
          performance: healthSummary.performanceMetrics,
        },

        // Data quality and freshness
        dataQuality: {
          isRealTime: Boolean(this.#healthCheckInterval),
          lastUpdated: healthSummary.lastUpdated,
          source: this.#healthCheckInterval ? 'active-monitoring' : 'on-demand-check',
        },
      },

      // Individual connection statuses
      connections: {
        statuses: connectionStatuses,
        registeredConnections: Array.from(this.#connectionInstances.keys()),
        totalConnections: this.#connectionInstances.size,
      },

      // Shared connection information
      sharedConnections: {
        total: this.#sharedConnections.size,
        references: Array.from(this.#sharedConnections.entries()).map(([connectionId, refs]) => ({
          connectionId,
          referencingApps: Array.from(refs),
          referenceCount: refs.size,
        })),
        totalReferences: Array.from(this.#sharedConnections.values()).reduce(
          (sum, refs) => sum + refs.size,
          0
        ),
      },

      // Component information
      components: {
        available: Object.keys(components).filter(key => components[key] != null),
        total: Object.keys(components).length,
        statuses: components,
      },

      // Configuration summary
      configuration: {
        shutdownTimeout: this.#configManager.get('registry.shutdownTimeout'),
      },

      // System information
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },

      timestamp: new Date(),
    };
  }

  /**
   * Get status of all registered apps with proper error handling.
   *
   * @returns {Promise<Object>} App statuses with error handling
   * @private
   */
  async #getConnectionStatuses() {
    const statuses = {};

    for (const [appName, connection] of this.#connectionInstances) {
      try {
        statuses[appName] = await connection?.getStatus();
      } catch (error) {
        statuses[appName] = {
          error: error.message,
          status: 'error',
          available: true,
          hasStatus: true,
        };
      }
    }

    return statuses;
  }

  /**
   * Get status of all components with proper error handling.
   *
   * @returns {Promise<Object>} Component statuses with null for unavailable components
   * @private
   */
  async #getComponentStatuses() {
    const statuses = {};

    for (const component of this.#getComponents()) {
      const fieldName = component.field.substring(1); // Remove '#' prefix
      try {
        statuses[fieldName] = await this[component.field]?.getStatus();
      } catch (error) {
        statuses[fieldName] = {
          error: error.message,
          status: 'error',
          available: true,
          hasStatus: true,
        };
      }
    }

    return statuses;
  }

  /**
   * Calculate enhanced health summary using the same scoring system as health monitoring.
   *
   * @param {Object} connectionStatuses - App status objects
   * @returns {Promise<Object>} Enhanced health summary with consistent categories and metrics
   * @private
   */
  async #calculateEnhancedHealthSummary(connectionStatuses) {
    const summary = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      timeout: 0,
      unknown: 0,
      averageHealthScore: 0,
      performanceMetrics: {
        totalConnections: 0,
        averageResponseTime: 0,
        slowestConnection: null,
        fastestConnection: null,
      },
      lastUpdated: new Date(),
    };

    const healthScores = [];
    const responseTimes = [];
    const performanceThreshold =
      this.#configManager.get('registry.healthPerformanceThreshold') || 2000;

    for (const [appName, status] of Object.entries(connectionStatuses)) {
      summary.performanceMetrics.totalConnections++;

      // Handle timeout and error cases first
      if (status.error && status.error.includes('timed out')) {
        summary.timeout++;
        continue;
      }

      if (status.error || status.status === 'error') {
        summary.unhealthy++;
        healthScores.push(0);
        continue;
      }

      // Calculate health score using the same logic as health monitoring
      const mockCheckDuration = status.responseTime || 100; // Use actual response time if available
      const healthScore = this.#calculateHealthScore(
        status,
        mockCheckDuration,
        performanceThreshold
      );
      healthScores.push(healthScore);

      if (mockCheckDuration) {
        responseTimes.push({ appName, duration: mockCheckDuration });
      }

      // Categorize by health score (same thresholds as health monitoring)
      if (healthScore >= 80) {
        summary.healthy++;
      } else if (healthScore >= 50) {
        summary.degraded++;
      } else if (healthScore > 0) {
        summary.unhealthy++;
      } else {
        summary.unknown++;
      }
    }

    // Calculate average health score
    if (healthScores.length > 0) {
      summary.averageHealthScore = Math.round(
        healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length
      );
    }

    // Calculate performance metrics
    if (responseTimes.length > 0) {
      const totalTime = responseTimes.reduce((sum, rt) => sum + rt.duration, 0);
      summary.performanceMetrics.averageResponseTime = Math.round(totalTime / responseTimes.length);

      const sortedTimes = responseTimes.sort((a, b) => a.duration - b.duration);
      summary.performanceMetrics.fastestConnection = {
        appName: sortedTimes[0].appName,
        responseTime: sortedTimes[0].duration,
      };
      summary.performanceMetrics.slowestConnection = {
        appName: sortedTimes[sortedTimes.length - 1].appName,
        responseTime: sortedTimes[sortedTimes.length - 1].duration,
      };
    }

    return summary;
  }

  /**
   * Handle connection reuse logic for app registration with enhanced sharing capabilities
   *
   * This method implements a sophisticated connection management strategy that supports:
   * 1. Preventing duplicate connections for the same app
   * 2. Advanced connection sharing with multiple reuse strategies
   * 3. Connection pooling and resource optimization
   * 4. One-way flow enforcement from Registry to ConnectionManager
   *
   * Connection Resolution Priority:
   * 1. Return existing connection if app is already registered
   * 2. Reuse connection from specified app if useConnection is provided
   * 3. Find compatible shareable connection if reuseConnection is true
   * 4. Create new connection with registry-controlled configuration
   *
   * Note: Auto-operations (migrations, seeds, models) are executed centrally by registerApp
   * after connection resolution, ensuring consistent behavior for all connection strategies.
   *
   * @param {string} appName - Unique app name for the connection
   * @param {boolean|string} useConnection - Connection reuse configuration:
   *   - false/null/undefined: Create new connection
   *   - string: Name of existing app to reuse connection from
   *   - true/'global': Auto-find compatible shareable connection
   * @param {Object} config - App configuration options (registry-controlled)
   * @returns {Promise<{connection: ConnectionManager, wasReused: boolean}>} Connection instance and reuse flag
   * @throws {Error} When connection creation or reuse fails
   * @private
   */
  async #handleConnectionReuse(appName, useConnection, config) {
    // Step 1: Check if app already exists (prevent duplicate connections)
    const connection = this.#connectionInstances.get(appName);
    if (connection) {
      this.#emitWarning(`App '${appName}' already exists, returning existing connection`, {
        phase: 'connection-reuse',
        appName,
      });

      // Notify plugins of connection creation/reuse
      await this.#notifyPlugins('onConnectionCreated', appName, connection);

      return { connection, wasReused: true };
    }

    // Step 2: Handle auto connection reuse (find compatible connection)
    if (useConnection === true || useConnection === 'global') {
      const sourceConnection = this.#findRecentShareableConnection();
      if (sourceConnection && sourceConnection.connection?.isShared) {
        this.emit('connection-reused', {
          appName,
          sourceApp: sourceConnection.appName,
          reuseType: 'auto-compatible',
          timestamp: new Date(),
        });

        this.#connectionInstances.set(appName, sourceConnection.connection);

        // Track shared connection reference
        this.#addSharedConnection(sourceConnection.connection, appName);

        // Notify plugins of connection creation/reuse
        await this.#notifyPlugins('onConnectionCreated', appName, sourceConnection.connection);

        return { connection: sourceConnection.connection, wasReused: true };
      }
    }

    // Step 3: Handle explicit connection reuse from named app
    else if (useConnection) {
      const sourceConnection = this.#connectionInstances.get(useConnection);
      if (sourceConnection?.isShared) {
        this.emit('connection-reused', {
          appName,
          sourceApp: useConnection,
          reuseType: 'explicit-app',
          timestamp: new Date(),
        });

        // Store reference to reused connection
        this.#connectionInstances.set(appName, sourceConnection);

        // Track shared connection reference
        this.#addSharedConnection(sourceConnection, appName);

        // Notify plugins of connection creation/reuse
        await this.#notifyPlugins('onConnectionCreated', appName, sourceConnection);

        return { connection: sourceConnection, wasReused: true };
      }
    }

    // Step 4: Create new connection with registry-controlled configuration
    const newConnection = await this.#createNewAppConnection(appName, config);

    // Track reference for new shared connections
    if (newConnection.isShared) {
      this.#addSharedConnection(newConnection, appName);
    }

    // Notify plugins of connection registration
    await this.#notifyPlugins('onConnectionCreated', appName, newConnection);

    return { connection: newConnection, wasReused: false };
  }

  /**
   * Find a shareable connection (returns the most recent one).
   *
   * @returns {Object|null} Recent shareable connection info or null if none found
   * @private
   */
  #findRecentShareableConnection() {
    const appEntries = Array.from(this.#connectionInstances.entries()).reverse();
    for (const [appName, connection] of appEntries) {
      if (connection?.isShared) {
        return { appName, connection };
      }
    }

    return null;
  }

  /**
   * Create new connection with registry-controlled configuration and auto-execution.
   *
   * Creates ConnectionManager, initializes all components, and automatically executes
   * migrations, seeds, and model registration based on configuration settings.
   *
   * @param {string} appName - App name
   * @param {Object} options - Configuration options
   * @param {boolean} [options.reusable=false] - If true, this connection is shared with other apps
   * @param {Object} [options.database] - Database connection configuration
   * @param {Object} [options.migrations] - Migration configuration
   * @param {boolean} [options.migrations.enabled] - Enable auto-migration execution
   * @param {Object} [options.seeds] - Seed configuration
   * @param {boolean} [options.seeds.enabled] - Enable auto-seed execution
   * @param {Object} [options.models] - Model configuration
   * @param {boolean} [options.models.enabled] - Enable auto-model registration
   * @param {Object} [options.models.definitions] - Model definitions to register
   * @param {Function} [options.models.BaseModel] - Custom BaseModel class
   * @param {String} [options.cwd] - Current working directory for the app
   * @returns {Promise<ConnectionManager>} New ConnectionManager instance with auto-operations completed
   * @throws {Error} When connection creation, initialization, or auto-operations fail
   * @private
   */
  async #createNewAppConnection(appName, options) {
    try {
      // Extract shared flag from database config (supports both 'shared' and 'reusable')
      const isShared =
        options.database?.shared || options.database?.reusable || options.reusable || false;

      // Create ConnectionManager instance with registry-controlled config using overridden component
      const connection = new COMPONENT_CLASSES.ConnectionManager(options, appName, isShared);

      // Initialize the connection (one-way flow: Registry controls initialization)
      await connection.initialize();

      // Store app instance in registry
      this.#connectionInstances.set(appName, connection);

      this.emit('connection-created', {
        appName,
        timestamp: new Date(),
      });

      return connection;
    } catch (error) {
      // Cleanup on failure
      this.#connectionInstances.delete(appName);

      this.#emitError(`Failed to create connection for app '${appName}': ${error.message}`, {
        phase: 'connection-creation',
        appName,
        error: error.message,
      });

      throw new Error(`Failed to create connection for app '${appName}': ${error.message}`);
    }
  }

  /**
   * Execute automatic database operations based on configuration
   * Handles auto-running migrations, seeds, and model registration after connection initialization
   *
   * @param {ConnectionManager} connection - The initialized connection instance
   * @param {string} appName - App name for logging and error context
   * @param {Object} config - App configuration containing auto-execution settings
   * @private
   * @returns {Promise<void>}
   */
  async #runAutoOperations(connection, appName, config) {
    const autoOperations = {
      migrations: false,
      seeds: false,
      models: false,
    };

    try {
      // Notify plugins that auto-operations are starting
      await this.#notifyPlugins('onAutoOperationsStarted', appName, connection, config);

      // 1. Auto-run migrations if configured
      if (config.migrations?.enabled === true) {
        this.emit('auto-migration-started', {
          appName,
          timestamp: new Date(),
        });

        const migrationResult = await connection.runMigrations({
          ...config.migrations,
          appName,
        });
        autoOperations.migrations = true;

        this.emit('auto-migration-completed', {
          appName,
          result: migrationResult,
          timestamp: new Date(),
        });
      }

      // 2. Auto-run seeds if configured (after migrations)
      if (config.seeds?.enabled === true) {
        this.emit('auto-seed-started', {
          appName,
          timestamp: new Date(),
        });

        const seedResult = await connection.runSeeds({
          ...config.seeds,
          appName,
        });
        autoOperations.seeds = true;

        this.emit('auto-seed-completed', {
          appName,
          result: seedResult,
          timestamp: new Date(),
        });
      }

      // 3. Auto-register models if configured
      if (
        config.models?.enabled === true &&
        config.models?.definitions &&
        typeof config.models.definitions === 'object'
      ) {
        this.emit('auto-model-registration-started', {
          appName,
          modelCount: Object.keys(config.models.definitions).length,
          timestamp: new Date(),
        });

        const modelResult = await connection.registerModels(
          config.models.definitions,
          config.models.BaseModel || null
        );
        autoOperations.models = true;

        this.emit('auto-model-registration-completed', {
          appName,
          models: Object.keys(modelResult),
          modelCount: Object.keys(modelResult).length,
          timestamp: new Date(),
        });
      }

      // Emit summary of auto-operations performed
      if (autoOperations.migrations || autoOperations.seeds || autoOperations.models) {
        this.emit('auto-operations-completed', {
          appName,
          operations: autoOperations,
          timestamp: new Date(),
        });

        // Notify plugins that auto-operations have completed
        await this.#notifyPlugins('onAutoOperationsCompleted', appName, {
          operations: autoOperations,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      // Notify plugins of auto-operations failure
      await this.#notifyPlugins('onOperationFailed', appName, 'auto-operations', error, {
        phase: 'auto-operations',
        appName,
        operations: autoOperations,
        error: error.message,
      });

      // Emit detailed error information for auto-operations
      this.#emitError(`Auto-operations failed for app '${appName}': ${error.message}`, {
        phase: 'auto-operations',
        appName,
        operations: autoOperations,
        error: error.message,
      });

      // Re-throw to be handled by the calling method
      throw new Error(`Auto-operations failed for app '${appName}': ${error.message}`);
    }
  }

  /**
   * Emit standardized warning event with consistent structure
   *
   * @param {string} message - Warning message
   * @param {Object} context - Additional context for the warning
   * @private
   */
  #emitWarning(message, context = {}) {
    this.emit('warning', {
      message,
      timestamp: new Date(),
      ...context,
    });
  }

  /**
   * Emit standardized error event with consistent structure
   *
   * @param {string} message - Error message
   * @param {Object} context - Additional context for the error
   * @private
   */
  #emitError(message, context = {}) {
    this.emit('error', {
      message,
      timestamp: new Date(),
      ...context,
    });
  }

  /**
   * Add shared connection reference
   *
   * @param {Object} connection - Connection instance
   * @param {string} appName - App name using the connection
   * @private
   */
  #addSharedConnection(connection, appName) {
    if (!connection.isShared) return;

    const connectionId = this.#getConnectionId(connection);

    if (!this.#sharedConnections.has(connectionId)) {
      this.#sharedConnections.set(connectionId, new Set());
    }

    this.#sharedConnections.get(connectionId).add(appName);

    this.emit('shared-connection-added', {
      connectionId,
      appName,
      totalRefs: this.#sharedConnections.get(connectionId).size,
      timestamp: new Date(),
    });
  }

  /**
   * Remove shared connection reference
   *
   * @param {Object} connection - Connection instance
   * @param {string} appName - App name to remove
   * @returns {boolean} True if this was the last reference
   * @private
   */
  #removeSharedConnection(connection, appName) {
    if (!connection.isShared) return false;

    const connectionId = this.#getConnectionId(connection);
    const refs = this.#sharedConnections.get(connectionId);

    if (!refs) return false;

    refs.delete(appName);

    this.emit('shared-connection-removed', {
      connectionId,
      appName,
      remainingRefs: refs.size,
      timestamp: new Date(),
    });

    // Return true if this was the last reference
    if (refs.size === 0) {
      this.#sharedConnections.delete(connectionId);
      return true;
    }

    return false;
  }

  /**
   * Generate unique connection ID
   *
   * @param {Object} connection - Connection instance
   * @returns {string} Unique connection identifier
   * @private
   */
  #getConnectionId(connection) {
    // Create unique ID based on connection properties
    const config = connection.config?.database || {};
    return `${config.client || 'unknown'}_${config.host || 'localhost'}_${config.port || 'default'}_${config.database || 'default'}`;
  }

  /**
   * Cleanup app state during unregistration or failure
   *
   * Performs comprehensive cleanup including rollback of migrations, seeds,
   * and model cleanup before connection shutdown to ensure clean state.
   *
   * @param {string} appName - App name to cleanup
   * @param {Object} [options={}] - Cleanup options
   * @param {boolean} [options.skipRollback=false] - Skip rollback operations
   * @param {boolean} [options.forceCleanup=false] - Force cleanup even on errors
   * @param {number} [options.timeout] - Timeout for connection shutdown operations
   * @private
   */
  async #cleanupAppState(appName, options = {}) {
    const { skipRollback = false, forceCleanup = false, timeout } = options;

    // Get the connection before removing the app instance
    const connection = this.#connectionInstances.get(appName);

    // Remove from apps instances
    this.#connectionInstances.delete(appName);

    // Handle shared connection cleanup with reference counting
    if (connection) {
      // Perform rollback operations before connection cleanup
      if (!skipRollback) {
        await this.#performAppRollback(connection, appName, { forceCleanup });
      }

      const connectionId = this.#getConnectionId(connection);
      // Shared connection cleanup
      if (connection.isShared) {
        // Remove reference and check if this was the last app using this shared connection
        const isLastReference = this.#removeSharedConnection(connection, appName);

        // If this was the last app using this shared connection - safe to close it
        if (isLastReference) {
          try {
            // Notify plugins that shared connection is being shut down
            await this.#notifyPlugins('onConnectionShutdown', appName, connection, {
              shared: true,
              lastReference: true,
              connectionId,
              timeout,
            });

            await connection.shutdown(timeout ? { timeout } : undefined);

            this.emit('shared-connection-closed', {
              connectionId,
              lastApp: appName,
              timestamp: new Date(),
            });
          } catch (error) {
            this.#emitWarning('Failed to close shared connection', {
              connectionId,
              error: error.message,
            });
          }
        }
        // Other apps still using this connection - keep it alive
        else {
          this.emit('shared-connection-kept-alive', {
            connectionId,
            removedApp: appName,
            remainingRefs: this.#sharedConnections.get(connectionId).size,
            timestamp: new Date(),
          });
        }
      }
      // Non-shared connection - safe to close immediately
      else {
        try {
          // Notify plugins that non-shared connection is being shut down
          await this.#notifyPlugins('onConnectionShutdown', appName, connection, {
            shared: false,
            connectionId,
            timeout,
          });

          await connection.shutdown(timeout ? { timeout } : undefined);

          this.emit('non-shared-connection-closed', {
            connectionId,
            appName,
            timestamp: new Date(),
          });
        } catch (error) {
          this.#emitWarning('Failed to close non-shared connection', {
            connectionId,
            appName,
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * Perform comprehensive rollback operations for an app during cleanup
   *
   * Rolls back seeds, migrations, and clears models to ensure clean state
   * during app unregistration or failure recovery.
   *
   * @param {ConnectionManager} connection - The connection instance to rollback
   * @param {string} appName - App name for logging and error context
   * @param {Object} [options={}] - Rollback options
   * @param {boolean} [options.forceCleanup=false] - Continue cleanup even on rollback errors
   * @private
   * @returns {Promise<Object>} Rollback result with success status and operation details
   */
  async #performAppRollback(connection, appName, options = {}) {
    const { forceCleanup = false } = options;
    const rollbackOperations = {
      seeds: { attempted: false, success: false, error: null },
      migrations: { attempted: false, success: false, error: null },
      models: { attempted: false, success: false, error: null },
    };

    const startTime = Date.now();

    this.emit('app-rollback-started', {
      appName,
      timestamp: new Date(),
    });

    // Notify plugins that rollback operations are starting
    await this.#notifyPlugins('onAppRollbackStarted', appName, connection, options);

    try {
      // 1. Clear registered models (cleanup only, no rollback needed)
      try {
        rollbackOperations.models.attempted = true;

        // Get list of registered models before clearing
        const registeredModels =
          typeof connection?.getModelNames === 'function' ? connection.getModelNames() : [];

        // Clear models if the connection supports it
        if (typeof connection?.clearModels === 'function') {
          await connection.clearModels();
        }

        rollbackOperations.models.success = true;

        this.emit('app-model-cleanup-completed', {
          appName,
          clearedModels: registeredModels,
          modelCount: registeredModels.length,
          timestamp: new Date(),
        });
      } catch (error) {
        rollbackOperations.models.error = error.message;
        this.#emitWarning(`Model cleanup failed for app '${appName}': ${error.message}`, {
          phase: 'model-cleanup',
          appName,
          error: error.message,
        });
      }

      // 2. Rollback seeds first (reverse order of execution)
      try {
        rollbackOperations.seeds.attempted = true;

        // Check if connection has seed management capabilities
        if (typeof connection?.rollbackSeeds === 'function') {
          const seedResult = await connection.rollbackSeeds({
            steps: 1, // Rollback last batch by default
            force: forceCleanup,
            appName,
          });
          rollbackOperations.seeds.success = true;

          this.emit('app-seed-rollback-completed', {
            appName,
            result: seedResult,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        rollbackOperations.seeds.error = error.message;
        this.#emitWarning(`Seed rollback failed for app '${appName}': ${error.message}`, {
          phase: 'seed-rollback',
          appName,
          error: error.message,
        });
      }

      // 3. Rollback migrations (after seeds)
      try {
        rollbackOperations.migrations.attempted = true;

        // Check if connection has migration management capabilities
        if (typeof connection?.rollbackMigrations === 'function') {
          const migrationResult = await connection.rollbackMigrations({
            step: 1, // Rollback one step by default
            force: forceCleanup,
            appName,
          });
          rollbackOperations.migrations.success = true;

          this.emit('app-migration-rollback-completed', {
            appName,
            result: migrationResult,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        rollbackOperations.migrations.error = error.message;
        this.#emitWarning(`Migration rollback failed for app '${appName}': ${error.message}`, {
          phase: 'migration-rollback',
          appName,
          error: error.message,
        });
      }

      // Emit successful rollback completion
      const result = {
        success: true,
        duration: Date.now() - startTime,
        operations: rollbackOperations,
        appName,
        timestamp: new Date(),
      };

      // Notify plugins that rollback operations have completed
      await this.#notifyPlugins('onAppRollbackCompleted', appName, result);

      this.emit('app-rollback-completed', result);
      return result;
    } catch (error) {
      // Emit rollback failure
      const result = {
        success: false,
        duration: Date.now() - startTime,
        operations: rollbackOperations,
        appName,
        error: error.message,
        timestamp: new Date(),
      };

      this.emit('app-rollback-failed', result);

      return result;
    }
  }

  /**
   * Validate configuration
   *
   * @throws {Error} When configuration validation fails
   * @private
   */
  #validateConfiguration() {
    // Validate numeric values (must be positive numbers)
    const numericFields = ['shutdownTimeout', 'healthCheckInterval', 'healthPerformanceThreshold'];
    for (const field of numericFields) {
      const value = this.#configManager.get(`registry.${field}`);
      if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
        throw new Error(
          `Configuration field 'registry.${field}' must be a positive finite number, got ${typeof value}: ${value}`
        );
      }
    }

    // Validate configuration consistency
    const healthCheckInterval = this.#configManager.get('registry.healthCheckInterval');
    const shutdownTimeout = this.#configManager.get('registry.shutdownTimeout');

    // Health check interval should be reasonable (not too frequent)
    if (healthCheckInterval < 1000) {
      throw new Error(
        `Configuration field 'registry.healthCheckInterval' should be at least 1000ms to avoid excessive monitoring overhead, got: ${healthCheckInterval}ms`
      );
    }

    // Shutdown timeout should be reasonable (not too short)
    if (shutdownTimeout < 5000) {
      throw new Error(
        `Configuration field 'registry.shutdownTimeout' should be at least 5000ms to allow proper cleanup, got: ${shutdownTimeout}ms`
      );
    }
  }

  /**
   * Initialize comprehensive system health monitoring for registered connections
   *
   * Provides comprehensive system health monitoring with:
   * - Parallel health checks with timeout protection
   * - Health trend tracking and analysis
   * - Performance metrics and bottleneck detection
   * - Configurable health criteria and thresholds
   * - Rich monitoring events for observability
   *
   * Health Check Criteria:
   * - Connection initialization status
   * - Database connection availability
   * - Component operational status
   * - Performance metrics within thresholds
   * - Error rate below acceptable limits
   *
   * Events Emitted:
   * - 'health-monitoring-started': When monitoring begins
   * - 'health-monitoring-disabled': When monitoring is disabled
   * - 'health-check-warning': When unhealthy connections detected
   * - 'health-check-completed': After each health check cycle
   * - 'health-trend-alert': When health trends indicate issues
   * - 'health-performance-alert': When performance degrades
   *
   * @private
   */
  #initializeSystemHealthMonitoring() {
    // Check if health monitoring is enabled
    if (!this.#configManager.get('registry.enableHealthMonitoring')) {
      this.emit('health-monitoring-disabled', {
        message: 'Health monitoring is disabled in configuration',
        reason: 'configuration-disabled',
        timestamp: new Date(),
      });
      return;
    }

    // Determine health status from health score
    const determineHealthStatus = healthScore => {
      if (healthScore >= 80) return 'healthy';
      if (healthScore >= 50) return 'degraded';
      return 'unhealthy';
    };

    const interval = this.#configManager.get('registry.healthCheckInterval');
    const healthTimeout = Math.min(interval / 2, 5000); // Max 5s or half interval
    const performanceThreshold =
      this.#configManager.get('registry.healthPerformanceThreshold') || 2000;

    // Initialize health tracking
    const healthHistory = new Map(); // connectionName -> health history
    let cycleCount = 0;

    this.#healthCheckInterval = setInterval(async () => {
      try {
        const healthCheckStart = Date.now();
        const cycleId = `health-${Date.now()}-${++cycleCount}`;

        const healthResults = {
          healthy: [],
          unhealthy: [],
          degraded: [],
          timeout: [],
          errorDetails: new Map(),
          performanceMetrics: new Map(),
        };

        // Parallel health checks with timeout protection
        const healthCheckPromises = Array.from(this.#connectionInstances.entries()).map(
          async ([appName, connection]) => {
            const checkStart = Date.now();

            try {
              const status = await TimeoutManager.withTimeout(
                () => connection.getStatus(),
                healthTimeout,
                {
                  operation: 'health-check',
                  component: 'AppRegistry',
                  connectionName: appName,
                }
              );

              const checkDuration = Date.now() - checkStart;

              // Enhanced health criteria
              const healthScore = this.#calculateHealthScore(
                status,
                checkDuration,
                performanceThreshold
              );
              const healthStatus = determineHealthStatus(healthScore);

              // Store performance metrics
              healthResults.performanceMetrics.set(appName, {
                checkDuration,
                healthScore,
                memoryUsage: status.system?.memoryUsage,
                connectionPool: status.connection?.pool,
              });

              // Update health history
              this.#updateHealthHistory(healthHistory, appName, healthScore, healthStatus);

              // Notify plugins of health check
              const _pluginHealthData = await this.#notifyPlugins('onHealthCheck', appName, {
                healthScore,
                healthStatus,
                checkDuration,
                status,
                timestamp: new Date(),
              });

              // Categorize by health status
              switch (healthStatus) {
                case 'healthy':
                  healthResults.healthy.push(appName);
                  break;
                case 'degraded':
                  healthResults.degraded.push(appName);
                  healthResults.errorDetails.set(appName, {
                    status: 'degraded',
                    healthScore,
                    issues: this.#identifyHealthIssues(status, checkDuration, performanceThreshold),
                  });
                  break;
                case 'unhealthy':
                  healthResults.unhealthy.push(appName);
                  healthResults.errorDetails.set(appName, {
                    status: 'unhealthy',
                    healthScore,
                    initialized: status.initialized,
                    connected: status.connection?.connected,
                    issues: this.#identifyHealthIssues(status, checkDuration, performanceThreshold),
                  });
                  break;
              }
            } catch (error) {
              const checkDuration = Date.now() - checkStart;

              if (error.code === 'TIMEOUT') {
                healthResults.timeout.push(appName);
                healthResults.errorDetails.set(appName, {
                  status: 'timeout',
                  error: `Health check timed out after ${healthTimeout}ms`,
                  checkDuration,
                  type: 'timeout',
                });
              } else {
                healthResults.unhealthy.push(appName);
                healthResults.errorDetails.set(appName, {
                  status: 'error',
                  error: error.message,
                  checkDuration,
                  type: 'status-check-failed',
                });
              }

              // Update health history with failure
              this.#updateHealthHistory(healthHistory, appName, 0, 'unhealthy');
            }
          }
        );

        // Wait for all health checks to complete
        await Promise.allSettled(healthCheckPromises);

        const totalCheckDuration = Date.now() - healthCheckStart;
        const totalConnections = this.#connectionInstances.size;

        // Calculate system health metrics
        const systemMetrics = this.#calculateSystemMetrics(
          healthResults,
          totalConnections,
          totalCheckDuration
        );

        // Analyze health trends
        const trendAnalysis = this.#analyzeHealthTrends(healthHistory);

        // Emit warnings for various conditions
        this.#emitHealthAlerts(healthResults, systemMetrics, trendAnalysis, cycleId);

        // Emit comprehensive completion event
        this.emit('health-check-completed', {
          cycleId,
          totalConnections,
          healthCounts: {
            healthy: healthResults.healthy.length,
            degraded: healthResults.degraded.length,
            unhealthy: healthResults.unhealthy.length,
            timeout: healthResults.timeout.length,
          },
          systemMetrics,
          trendAnalysis,
          performanceMetrics: {
            totalCheckDuration,
            averageCheckDuration: totalCheckDuration / Math.max(totalConnections, 1),
            slowestConnection: this.#findSlowestConnection(healthResults.performanceMetrics),
            fastestConnection: this.#findFastestConnection(healthResults.performanceMetrics),
          },
          allHealthy: healthResults.unhealthy.length === 0 && healthResults.timeout.length === 0,
          timestamp: new Date(),
        });
      } catch (error) {
        this.#emitError(`Health monitoring cycle failed: ${error.message}`, {
          phase: 'health-monitoring',
          cycleId: `error-${Date.now()}`,
          error: error.message,
        });
      }
    }, interval);
  }

  /**
   * Calculate health score based on multiple criteria
   *
   * @param {Object} status - Connection status
   * @param {number} checkDuration - Health check duration in ms
   * @param {number} performanceThreshold - Performance threshold in ms
   * @returns {number} Health score (0-100)
   * @private
   */
  #calculateHealthScore(status, checkDuration, performanceThreshold) {
    let score = 0;

    // Initialization score (30 points)
    if (status.initialized) score += 30;

    // Connection score (25 points)
    if (status.database?.connected) score += 25;

    // Component health score (25 points)
    const componentCount = Object.keys(status.components || {}).length;
    const healthyComponents = Object.values(status.components || {}).filter(
      comp => comp && !comp.error
    ).length;
    if (componentCount > 0) {
      score += Math.round((healthyComponents / componentCount) * 25);
    }

    // Performance score (20 points)
    if (checkDuration <= performanceThreshold * 0.5) {
      score += 20; // Excellent performance
    } else if (checkDuration <= performanceThreshold) {
      score += 15; // Good performance
    } else if (checkDuration <= performanceThreshold * 1.5) {
      score += 10; // Acceptable performance
    } else {
      score += 5; // Poor performance
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Update health history for trend analysis
   *
   * @param {Map} healthHistory - Health history map
   * @param {string} appName - Connection name
   * @param {number} healthScore - Current health score
   * @param {string} healthStatus - Current health status
   * @private
   */
  #updateHealthHistory(healthHistory, appName, healthScore, healthStatus) {
    if (!healthHistory.has(appName)) {
      healthHistory.set(appName, []);
    }

    const history = healthHistory.get(appName);
    history.push({
      score: healthScore,
      status: healthStatus,
      timestamp: Date.now(),
    });

    // Keep only last 10 entries for trend analysis
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Identify specific health issues
   *
   * @param {Object} status - Connection status
   * @param {number} checkDuration - Health check duration
   * @param {number} performanceThreshold - Performance threshold
   * @returns {string[]} Array of identified issues
   * @private
   */
  #identifyHealthIssues(status, checkDuration, performanceThreshold) {
    const issues = [];

    if (!status.initialized) issues.push('not-initialized');
    if (!status.database?.connected) issues.push('database-disconnected');
    if (checkDuration > performanceThreshold) issues.push('slow-response');

    // Check component issues
    Object.entries(status.components || {}).forEach(([name, comp]) => {
      if (comp?.error) issues.push(`component-error-${name}`);
    });

    // Check memory issues
    if (status.system?.memoryUsage?.heapUsed > 100 * 1024 * 1024) {
      issues.push('high-memory-usage');
    }

    return issues;
  }

  /**
   * Calculate system-wide health metrics
   *
   * @param {Object} healthResults - Health check results
   * @param {number} totalConnections - Total connection count
   * @param {number} totalCheckDuration - Total check duration
   * @returns {Object} System metrics
   * @private
   */
  #calculateSystemMetrics(healthResults, totalConnections, totalCheckDuration) {
    const healthyCount = healthResults.healthy.length;
    const degradedCount = healthResults.degraded.length;
    const unhealthyCount = healthResults.unhealthy.length;
    const timeoutCount = healthResults.timeout.length;

    // Calculate performance rating from metrics
    const calculatePerformanceRating = performanceMetrics => {
      if (performanceMetrics.size === 0) return 'unknown';

      const durations = Array.from(performanceMetrics.values()).map(m => m.checkDuration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      if (avgDuration < 100) return 'excellent';
      if (avgDuration < 500) return 'good';
      if (avgDuration < 1000) return 'fair';
      return 'poor';
    };

    return {
      systemHealthPercentage:
        totalConnections > 0
          ? Math.round(((healthyCount + degradedCount * 0.5) / totalConnections) * 100)
          : 100,
      availabilityPercentage:
        totalConnections > 0
          ? Math.round(((totalConnections - timeoutCount) / totalConnections) * 100)
          : 100,
      performanceRating: calculatePerformanceRating(healthResults.performanceMetrics),
      totalCheckDuration,
      connectionCounts: {
        healthy: healthyCount,
        degraded: degradedCount,
        unhealthy: unhealthyCount,
        timeout: timeoutCount,
        total: totalConnections,
      },
    };
  }

  /**
   * Analyze health trends for predictive alerts
   *
   * @param {Map} healthHistory - Health history map
   * @returns {Object} Trend analysis
   * @private
   */
  #analyzeHealthTrends(healthHistory) {
    const trends = {
      declining: [],
      improving: [],
      stable: [],
      volatile: [],
    };

    // Calculate trend from score array
    const calculateTrend = scores => {
      if (scores.length < 2) return 0;
      return scores[scores.length - 1] - scores[0];
    };

    for (const [appName, history] of healthHistory) {
      if (history.length < 3) {
        trends.stable.push(appName);
        continue;
      }

      const recent = history.slice(-3);
      const scores = recent.map(h => h.score);
      const trend = calculateTrend(scores);

      if (Math.abs(trend) < 5) trends.stable.push(appName);
      else if (trend > 10) trends.improving.push(appName);
      else if (trend < -10) trends.declining.push(appName);
      else trends.volatile.push(appName);
    }

    return trends;
  }

  /**
   * Emit health alerts based on results and trends
   *
   * @param {Object} healthResults - Health check results
   * @param {Object} systemMetrics - System metrics
   * @param {Object} trendAnalysis - Trend analysis
   * @param {string} cycleId - Health check cycle ID
   * @private
   */
  #emitHealthAlerts(healthResults, systemMetrics, trendAnalysis, cycleId) {
    // Emit warning for unhealthy connections
    if (healthResults.unhealthy.length > 0 || healthResults.timeout.length > 0) {
      this.emit('health-check-warning', {
        cycleId,
        unhealthyConnections: healthResults.unhealthy,
        timeoutConnections: healthResults.timeout,
        degradedConnections: healthResults.degraded,
        healthyConnections: healthResults.healthy,
        systemMetrics,
        errorDetails: Object.fromEntries(healthResults.errorDetails),
        timestamp: new Date(),
      });
    }

    // Emit trend alerts
    if (trendAnalysis.declining.length > 0) {
      this.emit('health-trend-alert', {
        cycleId,
        type: 'declining',
        connections: trendAnalysis.declining,
        message: `Health declining for ${trendAnalysis.declining.length} connection(s)`,
        timestamp: new Date(),
      });
    }

    // Emit performance alerts
    if (systemMetrics.performanceRating === 'poor') {
      this.emit('health-performance-alert', {
        cycleId,
        performanceRating: systemMetrics.performanceRating,
        totalCheckDuration: systemMetrics.totalCheckDuration,
        message: 'System performance is degraded',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Find slowest connection from performance metrics
   *
   * @param {Map} performanceMetrics - Performance metrics map
   * @returns {Object|null} Slowest connection info
   * @private
   */
  #findSlowestConnection(performanceMetrics) {
    if (performanceMetrics.size === 0) return null;

    let slowest = null;
    let maxDuration = 0;

    for (const [appName, metrics] of performanceMetrics) {
      if (metrics.checkDuration > maxDuration) {
        maxDuration = metrics.checkDuration;
        slowest = { appName, duration: maxDuration };
      }
    }

    return slowest;
  }

  /**
   * Find fastest connection from performance metrics
   *
   * @param {Map} performanceMetrics - Performance metrics map
   * @returns {Object|null} Fastest connection info
   * @private
   */
  #findFastestConnection(performanceMetrics) {
    if (performanceMetrics.size === 0) return null;

    let fastest = null;
    let minDuration = Infinity;

    for (const [appName, metrics] of performanceMetrics) {
      if (metrics.checkDuration < minDuration) {
        minDuration = metrics.checkDuration;
        fastest = { appName, duration: minDuration };
      }
    }

    return fastest;
  }

  /**
   * Shutdown all connections in parallel with timeout protection
   *
   * @param {number} timeout - Timeout for each connection shutdown
   * @param {Object} shutdownStats - Shutdown statistics object
   * @private
   */
  async #shutdownConnections(timeout, shutdownStats) {
    const connectionShutdownPromises = Array.from(this.#connectionInstances.entries()).map(
      async ([appName, connection]) => {
        try {
          // Notify plugins that connection is being shut down during registry shutdown
          await this.#notifyPlugins('onConnectionShutdown', appName, connection, {
            registryShutdown: true,
            timeout,
          });

          await TimeoutManager.withTimeout(() => connection.shutdown({ timeout }), timeout, {
            operation: 'connection-shutdown',
            component: 'AppRegistry',
            appName,
          });
          shutdownStats.appsShutdown++;
          this.emit('app-shutdown', { appName, timestamp: new Date() });
        } catch (error) {
          const errorMsg = `Failed to shutdown app ${appName}: ${error.message}`;
          shutdownStats.errors.push(errorMsg);
          this.#emitWarning(`Failed to shutdown app ${appName}`, {
            phase: 'app-shutdown',
            appName,
            error: error.message,
          });
        }
      }
    );

    await Promise.allSettled(connectionShutdownPromises);
  }

  /**
   * Shutdown shared components during AppRegistry shutdown
   *
   * @param {number} timeout - Timeout for each connection shutdown
   * @param {Object} shutdownStats - Shutdown statistics object
   * @private
   */
  async #shutdownComponents(timeout, shutdownStats) {
    const components = this.#getComponents();
    for (const component of components) {
      const instance = this[component.field];
      const componentName = `${component.field}`.substring(1);

      if (instance) {
        try {
          // Use timeout protection for component shutdown
          await TimeoutManager.withTimeout(() => instance.shutdown(), timeout, {
            operation: 'component-shutdown',
            component: componentName,
          });

          // Emit success event only after successful shutdown
          this.emit('component-shutdown', {
            component: componentName,
            success: true,
            timestamp: new Date(),
          });
        } catch (error) {
          shutdownStats.errors.push(`Failed to shutdown ${componentName}: ${error.message}`);
          this.#emitWarning(`Failed to shutdown ${componentName}`, {
            phase: 'component-shutdown',
            component: componentName,
            error: error.message,
          });
        }
      }

      // Always clear the reference
      this[component.field] = null;
    }
  }

  /**
   * Load a plugin into the AppRegistry
   *
   * @param {Function|PluginInterface} PluginClass - Plugin class or instance
   * @param {Object} config - Plugin configuration
   * @returns {Promise<PluginInterface>} The loaded plugin
   */
  async loadPlugin(PluginClass, config = {}) {
    this.#ensureInitialized();
    return await this.#pluginManager.load(PluginClass, config);
  }

  /**
   * Unload a plugin from the AppRegistry
   *
   * @param {string} pluginName - Name of the plugin to unload
   * @returns {Promise<boolean>} True if plugin was unloaded
   */
  async unloadPlugin(pluginName) {
    this.#ensureInitialized();
    return await this.#pluginManager.unload(pluginName);
  }

  /**
   * Get a specific plugin by name
   *
   * @param {string} name - Plugin name
   * @returns {PluginInterface|undefined} The plugin instance
   */
  getPlugin(name) {
    this.#ensureInitialized();
    return this.#pluginManager.get(name);
  }

  /**
   * Get all loaded plugins
   *
   * @returns {PluginInterface[]} Array of loaded plugins
   */
  getAllPlugins() {
    this.#ensureInitialized();
    return this.#pluginManager.getAll();
  }

  /**
   * Safely notify plugins, handling null pluginManager
   * @private
   */
  async #notifyPlugins(event, ...args) {
    if (this.#pluginManager) {
      try {
        await this.#pluginManager.notify(event, ...args);
      } catch (error) {
        // Log warning but don't throw - plugin notifications shouldn't break core functionality
        this.#emitWarning(`Plugin notification failed for event '${event}': ${error.message}`, {
          phase: 'plugin-notification',
          event,
          error: error.message,
        });
      }
    }
  }

  /**
   * Override component classes in the AppRegistry with enhanced validation
   *
   * Provides a robust way to replace default component implementations with custom ones.
   * Must be called before creating any AppRegistry instances. Supports comprehensive
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
      contextName: 'AppRegistry',
    });
  }

  /**
   * Shutdown all apps and cleanup registry
   *
   * @param {Object} [options={}] - Shutdown options
   * @param {number} [options.timeout=30000] - Timeout for each app shutdown
   * @returns {Promise<Object>} Shutdown result with statistics
   */
  async shutdown(options = {}) {
    const startTime = Date.now();
    const { timeout = this.#configManager.get('registry.shutdownTimeout') } = options;

    // Check if already shut down
    if (!this.#initialized) {
      this.#emitWarning('AppRegistry already shut down', {
        phase: 'shutdown',
      });
      return {
        success: true,
        reason: 'already-shutdown',
        duration: 0,
        shutdownTime: 0,
        statistics: { appsShutdown: 0, errors: [], totalAppInstances: 0 },
        timestamp: new Date(),
      };
    }

    this.#initialized = false;

    const shutdownStats = {
      appsShutdown: 0,
      errors: [],
      totalAppInstances: this.#connectionInstances.size,
    };

    // Shutdown shared components
    await this.#shutdownComponents(timeout, shutdownStats);

    // Shutdown all connections in parallel
    await this.#shutdownConnections(timeout, shutdownStats);

    // Stop health monitoring
    if (this.#healthCheckInterval) {
      clearInterval(this.#healthCheckInterval);
      this.#healthCheckInterval = null;
    }

    // Clear all state
    this.#connectionInstances.clear();
    this.#sharedConnections.clear();

    const result = {
      success: true,
      duration: Date.now() - startTime,
      shutdownTime: Date.now() - startTime,
      statistics: shutdownStats,
      timestamp: new Date(),
    };

    this.emit('shutdown-completed', result);
    this.removeAllListeners();

    return result;
  }
}
