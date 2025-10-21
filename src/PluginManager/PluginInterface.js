/**
 * Base interface for all rapid-objection plugins
 *
 * Provides the foundation for the pluggable architecture, defining the contract
 * that all plugins must implement to integrate with the AppRegistry system.
 */
export class PluginInterface {
  /**
   * Create a new plugin instance
   *
   * @param {string} name - Plugin name (must be unique)
   * @param {string} version - Plugin version
   */
  constructor(name, version) {
    if (!name || typeof name !== 'string') {
      throw new Error('Plugin name is required and must be a string');
    }

    if (!version || typeof version !== 'string') {
      throw new Error('Plugin version is required and must be a string');
    }

    this.name = name;
    this.version = version;
    this.enabled = false;
    this.initialized = false;
  }

  /**
   * Initialize the plugin with AppRegistry and configuration
   *
   * This method is called when the plugin is loaded and should set up
   * any necessary resources, event listeners, or integrations.
   *
   * @param {AppRegistry} appRegistry - The AppRegistry instance
   * @param {Object} config - Plugin-specific configuration
   * @returns {Promise<void>}
   * @throws {Error} Must be implemented by plugin
   */
  async initialize(_appRegistry, _config) {
    throw new Error(`Plugin '${this.name}' must implement initialize() method`);
  }

  /**
   * Shutdown the plugin and cleanup resources
   *
   * Called when the plugin is being unloaded or when the AppRegistry
   * is shutting down. Should cleanup any resources, close connections, etc.
   *
   * @returns {Promise<void>}
   * @throws {Error} Must be implemented by plugin
   */
  async shutdown() {
    throw new Error(`Plugin '${this.name}' must implement shutdown() method`);
  }

  /**
   * Get plugin status information
   *
   * @returns {Object} Plugin status object
   */
  getStatus() {
    return {
      name: this.name,
      version: this.version,
      enabled: this.enabled,
      initialized: this.initialized,
      timestamp: new Date(),
    };
  }

  /**
   * Validate plugin configuration
   *
   * Override this method to validate plugin-specific configuration.
   * Called before initialize() to ensure configuration is valid.
   *
   * @param {Object} config - Plugin configuration to validate
   * @returns {boolean} True if configuration is valid
   * @throws {Error} If configuration is invalid
   */
  async validateConfiguration(_config) {
    // Default implementation - no validation
    return true;
  }

  // Optional lifecycle hooks that plugins can implement

  /**
   * Called when app registration starts (before connection creation)
   *
   * @param {string} appName - Name of the app being registered
   * @param {Object} config - App configuration
   * @returns {Promise<void>}
   */
  async onAppRegistrationStarted(_appName, _config) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when an app is registered with the AppRegistry
   *
   * @param {string} appName - Name of the registered app
   * @param {ConnectionManager} connection - The app's connection
   * @param {Object} config - App configuration
   * @returns {Promise<void>}
   */
  async onAppRegistered(_appName, _connection, _config) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when app unregistration starts (before cleanup)
   *
   * @param {string} appName - Name of the app being unregistered
   * @param {Object} options - Unregistration options
   * @returns {Promise<void>}
   */
  async onAppUnregistrationStarted(_appName, _options) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when an app is unregistered from the AppRegistry
   *
   * @param {string} appName - Name of the unregistered app
   * @param {Object} options - Unregistration options
   * @returns {Promise<void>}
   */
  async onAppUnregistered(_appName, _options) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when a new connection is created
   *
   * @param {string} appName - Name of the app
   * @param {ConnectionManager} connection - The created connection
   * @returns {Promise<void>}
   */
  async onConnectionCreated(_appName, _connection) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when auto-operations are about to be executed
   *
   * @param {string} appName - Name of the app
   * @param {ConnectionManager} connection - The connection
   * @param {Object} config - App configuration
   * @returns {Promise<void>}
   */
  async onAutoOperationsStarted(_appName, _connection, _config) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when auto-operations have completed
   *
   * @param {string} appName - Name of the app
   * @param {Object} result - Auto-operations result
   * @returns {Promise<void>}
   */
  async onAutoOperationsCompleted(_appName, _result) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when app rollback operations start
   *
   * @param {string} appName - Name of the app
   * @param {ConnectionManager} connection - The connection
   * @param {Object} options - Rollback options
   * @returns {Promise<void>}
   */
  async onAppRollbackStarted(_appName, _connection, _options) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when app rollback operations complete
   *
   * @param {string} appName - Name of the app
   * @param {Object} result - Rollback result
   * @returns {Promise<void>}
   */
  async onAppRollbackCompleted(_appName, _result) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when a connection is being shut down
   *
   * @param {string} appName - Name of the app
   * @param {ConnectionManager} connection - The connection being shut down
   * @param {Object} options - Shutdown options
   * @returns {Promise<void>}
   */
  async onConnectionShutdown(_appName, _connection, _options) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called when an operation fails
   *
   * @param {string} appName - Name of the app
   * @param {string} operation - The operation that failed
   * @param {Error} error - The error that occurred
   * @param {Object} context - Additional context about the failure
   * @returns {Promise<void>}
   */
  async onOperationFailed(_appName, _operation, _error, _context) {
    // Optional hook - default implementation does nothing
  }

  /**
   * Called during health check operations
   *
   * @param {string} appName - Name of the app
   * @param {Object} healthStatus - Current health status
   * @returns {Promise<Object>} Additional health metrics from plugin
   */
  async onHealthCheck(_appName, _healthStatus) {
    // Optional hook - default implementation returns empty object
    return {};
  }
}
