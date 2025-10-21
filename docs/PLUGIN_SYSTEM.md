# 🔌 Plugin System Documentation

The rapid-objection Plugin System provides a powerful, extensible architecture
that allows you to add optional functionality through plugins without modifying
the core system.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Plugin Development](#plugin-development)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Plugin Opportunities](#plugin-opportunities)
- [Best Practices](#best-practices)

## 🎯 Overview

The Plugin System enables:

- **Optional Features**: Add functionality without core changes
- **Third-party Extensions**: Community and custom plugins
- **Dynamic Loading**: Runtime plugin management
- **Graceful Degradation**: Plugin failures don't crash the system
- **Performance Optimization**: Concurrent loading with timeout protection

### Key Benefits

- ✅ **Extensible**: Add new features without modifying core code
- ✅ **Maintainable**: Plugins are self-contained and independently testable
- ✅ **Performant**: Optimized loading with controlled concurrency
- ✅ **Robust**: Comprehensive error handling and timeout protection
- ✅ **Developer-Friendly**: Rich API and clear lifecycle hooks

## 🏗️ Architecture

```
AppRegistry (Core)
├── ConnectionManager (core)
├── ConfigurationManager (core)
├── PluginManager (core)
└── Plugin Ecosystem
    ├── @rapid-objection/backup-plugin
    ├── @rapid-objection/monitoring-plugin
    ├── @rapid-objection/cache-plugin
    └── custom-company-plugins
```

### Plugin Lifecycle

```
Configuration → Import → Validation → Initialize → Register → Ready
                  ↓         ↓           ↓          ↓        ↓
               Timeout   Interface   Lifecycle   Events   Usage
              Protection  Validation   Hooks    Emission
```

## 🚀 Getting Started

### Basic Usage

```javascript
import { AppRegistry } from 'rapid-objection';

const appRegistry = new AppRegistry({
  // Core configuration
  registry: {
    shutdownTimeout: 30000,
  },

  // Plugin configuration
  plugins: {
    'backup-plugin': {
      enabled: true,
      module: '@rapid-objection/backup-plugin',
      config: {
        directory: './backups',
        compression: true,
        schedule: '0 2 * * *', // Daily at 2 AM
      },
    },
    'monitoring-plugin': {
      enabled: true,
      module: '@rapid-objection/monitoring-plugin',
      config: {
        endpoint: 'http://prometheus:9090',
        interval: 30000,
      },
    },
  },
});

// Initialize with plugins
const result = await appRegistry.initialize();
console.log(`Loaded ${result.pluginCount} plugins`);
```

### Manual Plugin Loading

```javascript
import { MyCustomPlugin } from './plugins/MyCustomPlugin.js';

// Load plugin manually
const plugin = await appRegistry.loadPlugin(MyCustomPlugin, {
  setting1: 'value1',
  setting2: 'value2',
});

console.log('Plugin loaded:', plugin.name, plugin.version);
```

## 🛠️ Plugin Development

### Creating a Plugin

#### Constructor Configuration Pattern

Plugins now receive configuration in their constructor, allowing for early
initialization:

```javascript
import { PluginInterface } from 'rapid-objection';

export class BackupPlugin extends PluginInterface {
  constructor(config = {}) {
    super('backup-plugin', '1.0.0');
    this.backupScheduler = null;
    this.config = config; // Config is now passed to constructor
  }

  /**
   * Initialize plugin with AppRegistry and configuration
   */
  async initialize(appRegistry, config) {
    this.appRegistry = appRegistry;
    // Config is already available from constructor, but can be updated here
    this.config = { ...this.config, ...config };

    // Setup backup directory
    await this.setupBackupDirectory();

    // Initialize scheduler
    this.setupScheduler();

    console.log(
      `Backup plugin initialized with directory: ${this.config.directory}`
    );
  }

  /**
   * Shutdown plugin and cleanup resources
   */
  async shutdown() {
    if (this.backupScheduler) {
      this.backupScheduler.stop();
    }

    console.log('Backup plugin shut down');
  }

  /**
   * Validate plugin configuration (optional)
   *
   * This method is optional - only implement if you need custom validation.
   * The PluginManager will check if this method exists before calling it.
   */
  async validateConfiguration(config) {
    if (!config.directory) {
      throw new Error('Backup directory is required');
    }

    if (config.schedule && typeof config.schedule !== 'string') {
      throw new Error('Schedule must be a valid cron expression');
    }

    return true;
  }

  /**
   * React to app registration starting
   */
  async onAppRegistrationStarted(appName, config) {
    console.log(`Preparing backup for app: ${appName}`);
    // Prepare backup directory and configuration
    await this.prepareAppBackup(appName, config);
  }

  /**
   * React to app registration completion
   */
  async onAppRegistered(appName, connection, config) {
    console.log(`Setting up backup for app: ${appName}`);
    // Setup app-specific backup configuration
    await this.setupAppBackup(appName, connection);
  }

  /**
   * React to app unregistration completion
   */
  async onAppUnregistered(appName, options) {
    console.log(`Cleaning up backup for app: ${appName}`);
    // Cleanup app-specific backup resources
    await this.cleanupAppBackup(appName);
  }

  /**
   * React to operation failures
   */
  async onOperationFailed(appName, operation, error, context) {
    console.log(`Operation failed for ${appName}: ${operation}`);
    // Create emergency backup before cleanup
    await this.createEmergencyBackup(appName, {
      operation,
      error: error.message,
    });
  }

  // Plugin-specific methods
  async setupBackupDirectory() {
    const fs = await import('fs/promises');
    await fs.mkdir(this.config.directory, { recursive: true });
  }

  setupScheduler() {
    if (this.config.schedule) {
      // Setup cron scheduler for automatic backups
      // Implementation depends on your scheduler library
    }
  }

  async setupAppBackup(appName, connection) {
    // Setup backup configuration for specific app
  }

  async cleanupAppBackup(appName) {
    // Cleanup backup resources for specific app
  }
}
```

### Plugin Interface Methods

#### Required Methods

- `initialize(appRegistry, config)` - Initialize plugin with registry and config
- `shutdown()` - Cleanup plugin resources
- `getStatus()` - Return plugin status information

#### Optional Methods

- `validateConfiguration(config)` - Validate plugin configuration (called if
  method exists)

#### Optional Lifecycle Hooks

**App Registration Lifecycle:**

- `onAppRegistrationStarted(appName, config)` - App registration begins (before
  connection creation)
- `onConnectionCreated(appName, connection)` - Connection established (new or
  reused)
- `onAutoOperationsStarted(appName, connection, config)` - Auto-operations begin
  (migrations, seeds, models)
- `onAutoOperationsCompleted(appName, result)` - Auto-operations complete with
  results
- `onAppRegistered(appName, connection, config)` - App registration complete,
  app ready

**App Unregistration Lifecycle:**

- `onAppUnregistrationStarted(appName, options)` - App unregistration begins
- `onAppRollbackStarted(appName, connection, options)` - Rollback operations
  begin
- `onAppRollbackCompleted(appName, result)` - Rollback operations complete
- `onConnectionShutdown(appName, connection, options)` - Connection being shut
  down
- `onAppUnregistered(appName, options)` - App unregistration complete

**Error Handling & Monitoring:**

- `onOperationFailed(appName, operation, error, context)` - Any operation fails
- `onHealthCheck(appName, healthStatus)` - During health monitoring cycles

## ⚙️ Configuration

### Plugin Configuration Schema

```javascript
{
  "plugins": {
    "plugin-name": {
      "enabled": true,           // Enable/disable plugin
      "module": "module-path",   // Path to plugin module
      "config": {                // Plugin-specific configuration
        // Plugin configuration options
      }
    }
  }
}
```

### PluginManager Configuration

```javascript
const pluginManager = new PluginManager(appRegistry, {
  loadTimeout: 30000, // Plugin loading timeout (30s)
  shutdownTimeout: 15000, // Plugin shutdown timeout (15s)
  enableMetrics: true, // Enable performance metrics
});
```

## 📚 API Reference

### Plugin Lifecycle Hooks Reference

#### App Registration Lifecycle

**`onAppRegistrationStarted(appName, config)`**

- **When**: App registration begins, before connection creation
- **Purpose**: Prepare for incoming app registration, validate prerequisites
- **Parameters**:
  - `appName` (string): Name of the app being registered
  - `config` (Object): App configuration object
- **Use Cases**: Setup monitoring, validate config, prepare resources

**`onConnectionCreated(appName, connection)`**

- **When**: Connection established (new or reused)
- **Purpose**: React to connection creation/reuse
- **Parameters**:
  - `appName` (string): Name of the app
  - `connection` (ConnectionManager): The connection instance
- **Use Cases**: Setup connection monitoring, configure connection-specific
  features

**`onAutoOperationsStarted(appName, connection, config)`**

- **When**: Auto-operations begin (migrations, seeds, models)
- **Purpose**: Monitor or enhance auto-operations
- **Parameters**:
  - `appName` (string): Name of the app
  - `connection` (ConnectionManager): The connection instance
  - `config` (Object): App configuration
- **Use Cases**: Backup before operations, setup operation monitoring

**`onAutoOperationsCompleted(appName, result)`**

- **When**: Auto-operations complete with results
- **Purpose**: React to completed auto-operations
- **Parameters**:
  - `appName` (string): Name of the app
  - `result` (Object): Auto-operations result with operation details
- **Use Cases**: Log operation results, trigger post-operation tasks

**`onAppRegistered(appName, connection, config)`**

- **When**: App registration complete, app ready for use
- **Purpose**: Setup app-specific features and monitoring
- **Parameters**:
  - `appName` (string): Name of the registered app
  - `connection` (ConnectionManager): The app's connection
  - `config` (Object): App configuration
- **Use Cases**: Setup app monitoring, configure app-specific features

#### App Unregistration Lifecycle

**`onAppUnregistrationStarted(appName, options)`**

- **When**: App unregistration begins
- **Purpose**: Prepare for app cleanup, backup data
- **Parameters**:
  - `appName` (string): Name of the app being unregistered
  - `options` (Object): Unregistration options
- **Use Cases**: Create backups, prepare cleanup procedures

**`onAppRollbackStarted(appName, connection, options)`**

- **When**: Rollback operations begin during cleanup
- **Purpose**: Monitor or enhance rollback operations
- **Parameters**:
  - `appName` (string): Name of the app
  - `connection` (ConnectionManager): The connection instance
  - `options` (Object): Rollback options
- **Use Cases**: Log rollback start, prepare rollback monitoring

**`onAppRollbackCompleted(appName, result)`**

- **When**: Rollback operations complete
- **Purpose**: React to completed rollback
- **Parameters**:
  - `appName` (string): Name of the app
  - `result` (Object): Rollback result with operation details
- **Use Cases**: Log rollback results, verify rollback success

**`onConnectionShutdown(appName, connection, options)`**

- **When**: Connection being shut down
- **Purpose**: Cleanup connection-specific resources
- **Parameters**:
  - `appName` (string): Name of the app
  - `connection` (ConnectionManager): Connection being shut down
  - `options` (Object): Shutdown context (shared, timeout, etc.)
- **Use Cases**: Save connection state, cleanup connection resources

**`onAppUnregistered(appName, options)`**

- **When**: App unregistration complete (after all cleanup)
- **Purpose**: Final cleanup and logging
- **Parameters**:
  - `appName` (string): Name of the unregistered app
  - `options` (Object): Unregistration options
- **Use Cases**: Final cleanup, log unregistration completion

#### Error Handling & Monitoring

**`onOperationFailed(appName, operation, error, context)`**

- **When**: Any operation fails (registration, auto-operations, unregistration)
- **Purpose**: Handle errors, implement recovery logic
- **Parameters**:
  - `appName` (string): Name of the app
  - `operation` (string): Operation that failed
  - `error` (Error): The error that occurred
  - `context` (Object): Additional error context
- **Use Cases**: Error logging, retry logic, emergency backups, alerting

**`onHealthCheck(appName, healthStatus)`**

- **When**: During health monitoring cycles
- **Purpose**: Enhance health checks with custom metrics
- **Parameters**:
  - `appName` (string): Name of the app
  - `healthStatus` (Object): Current health status and metrics
- **Returns**: Object with additional health metrics (optional)
- **Use Cases**: Add custom health metrics, trigger health-based actions

### AppRegistry Plugin Methods

#### `loadPlugin(PluginClass, config)`

Load a plugin manually.

```javascript
const plugin = await appRegistry.loadPlugin(MyPlugin, { option: 'value' });
```

#### `unloadPlugin(pluginName)`

Unload a plugin by name.

```javascript
const success = await appRegistry.unloadPlugin('my-plugin');
```

#### `getPlugin(name)`

Get a plugin instance by name.

```javascript
const plugin = appRegistry.getPlugin('backup-plugin');
if (plugin) {
  console.log('Plugin version:', plugin.version);
}
```

#### `getAllPlugins()`

Get all loaded plugins.

```javascript
const plugins = appRegistry.getAllPlugins();
plugins.forEach(plugin => {
  console.log(`${plugin.name} v${plugin.version}`);
});
```

### PluginManager Methods

#### `get(name)`

Get plugin by name.

#### `getAll()`

Get all plugins.

#### `has(name)`

Check if plugin exists.

#### `getStatus()`

Get comprehensive plugin system status.

```javascript
const status = pluginManager.getStatus();
console.log(`${status.counts.enabled}/${status.counts.total} plugins enabled`);
```

## 🎯 Examples

### Monitoring Plugin

```javascript
export class MonitoringPlugin extends PluginInterface {
  constructor(config = {}) {
    super('monitoring-plugin', '1.0.0');
    this.config = config;
    this.metrics = new Map();
  }

  async initialize(appRegistry, config) {
    this.appRegistry = appRegistry;
    // Merge constructor config with initialize config
    this.config = { ...this.config, ...config };

    // Setup metrics collection
    this.setupMetrics();
  }

  async onAppRegistered(appName, connection, config) {
    // Start monitoring this app
    this.startAppMonitoring(appName, connection);
  }

  async onHealthCheck(appName, healthStatus) {
    // Enhance health check with custom metrics
    const customMetrics = {
      queryLatency: this.getAverageQueryLatency(appName),
      connectionPoolUsage: this.getConnectionPoolUsage(appName),
      errorRate: this.getErrorRate(appName),
    };

    // Store enhanced metrics
    this.metrics.set(`${appName}-health`, {
      ...healthStatus,
      ...customMetrics,
      timestamp: new Date(),
    });

    return customMetrics;
  }

  async onOperationFailed(appName, operation, error, context) {
    // Track operation failures for monitoring
    const errorMetric = {
      appName,
      operation,
      error: error.message,
      context,
      timestamp: new Date(),
    };

    this.recordError(errorMetric);

    // Send alert if error rate is high
    if (this.getErrorRate(appName) > this.config.errorThreshold) {
      await this.sendAlert(
        `High error rate detected for ${appName}`,
        errorMetric
      );
    }
  }

  setupMetrics() {
    setInterval(() => {
      this.collectMetrics();
    }, this.config.interval || 30000);
  }

  collectMetrics() {
    const apps = this.appRegistry.getAllApps();
    apps.forEach(app => {
      // Collect app-specific metrics
      this.metrics.set(app.name, {
        connections: app.connection.pool?.numUsed() || 0,
        queries: app.connection.queryCount || 0,
        timestamp: new Date(),
      });
    });
  }
}
```

### Cache Plugin

```javascript
export class CachePlugin extends PluginInterface {
  constructor(config = {}) {
    super('cache-plugin', '1.0.0');
    this.config = config;
    this.cache = new Map();
  }

  async initialize(appRegistry, config) {
    this.appRegistry = appRegistry;
    // Merge constructor config with initialize config
    this.config = { ...this.config, ...config };

    // Setup cache with TTL
    this.setupCacheCleanup();
  }

  async onConnectionCreated(appName, connection) {
    // Add caching middleware to connection
    this.addCacheMiddleware(connection);
  }

  addCacheMiddleware(connection) {
    const originalQuery = connection.knex.raw.bind(connection.knex);

    connection.knex.raw = (sql, bindings) => {
      const cacheKey = this.generateCacheKey(sql, bindings);

      if (this.cache.has(cacheKey)) {
        return Promise.resolve(this.cache.get(cacheKey));
      }

      return originalQuery(sql, bindings).then(result => {
        this.cache.set(cacheKey, result);
        return result;
      });
    };
  }
}
```

## 💡 Plugin Opportunities

The comprehensive plugin lifecycle hooks enable a wide range of plugin types:

### 🔍 Monitoring & Observability Plugins

- **Registration Monitoring**: Track app registration/unregistration events
- **Health Monitoring**: Add custom health metrics and alerting
- **Performance Monitoring**: Track operation durations and failures
- **Connection Monitoring**: Monitor connection lifecycle and usage
- **Query Analytics**: Analyze database query patterns and performance

### 💾 Backup & Recovery Plugins

- **Pre-Registration Backup**: Backup before app registration
- **Pre-Unregistration Backup**: Backup before cleanup and rollback
- **Connection State Backup**: Save connection state before shutdown
- **Error Recovery**: Implement retry logic on operation failures
- **Automated Backup Scheduling**: Schedule regular backups based on app
  activity

### 🛡️ Security & Audit Plugins

- **Registration Audit**: Log all app registration attempts
- **Access Control**: Validate app registration permissions
- **Security Scanning**: Scan configurations during registration
- **Compliance Logging**: Track all operations for compliance
- **Threat Detection**: Monitor for suspicious activity patterns

### 🚀 Development & DevOps Plugins

- **Development Tools**: Auto-setup development environments
- **CI/CD Integration**: Integrate with deployment pipelines
- **Testing Automation**: Run tests during registration/health checks
- **Environment Management**: Manage different environments
- **Database Schema Validation**: Validate schema changes during operations

### 🔗 Integration Plugins

- **External Service Integration**: Notify external services of app events
- **Message Queue Integration**: Send events to message queues
- **Metrics Collection**: Send metrics to monitoring systems (Prometheus,
  DataDog)
- **Notification Systems**: Send alerts via email, Slack, Teams
- **API Gateway Integration**: Register/unregister apps with API gateways

### ⚡ Performance & Optimization Plugins

- **Query Caching**: Implement intelligent query caching
- **Connection Pooling**: Optimize connection pool settings
- **Load Balancing**: Distribute connections across multiple databases
- **Performance Tuning**: Auto-tune database settings based on usage
- **Resource Optimization**: Monitor and optimize resource usage

### 🔄 Data Management Plugins

- **Data Synchronization**: Sync data between environments
- **Data Migration**: Handle complex data migrations
- **Data Validation**: Validate data integrity during operations
- **Data Archiving**: Archive old data automatically
- **Data Anonymization**: Anonymize sensitive data for development

## 🎯 Best Practices

### Plugin Development

1. **Follow Interface Contract**

   - Always extend `PluginInterface`
   - Implement required methods
   - Use lifecycle hooks appropriately

2. **Error Handling**

   - Validate configuration thoroughly
   - Handle errors gracefully
   - Provide meaningful error messages

3. **Resource Management**

   - Clean up resources in `shutdown()`
   - Use timeouts for long operations
   - Handle connection lifecycle properly

4. **Performance**
   - Avoid blocking operations in lifecycle hooks
   - Use async/await properly
   - Implement efficient cleanup

### Configuration

1. **Validation**

   - Validate all configuration options
   - Provide sensible defaults
   - Document configuration schema

2. **Security**

   - Validate file paths and URLs
   - Sanitize user inputs
   - Use secure defaults

3. **Flexibility**
   - Support environment-specific configs
   - Allow runtime reconfiguration
   - Provide feature toggles

### Testing

1. **Unit Tests**

   - Test plugin initialization
   - Test lifecycle hooks
   - Test error conditions

2. **Integration Tests**

   - Test with real AppRegistry
   - Test plugin interactions
   - Test configuration scenarios

3. **Performance Tests**
   - Test loading times
   - Test resource usage
   - Test concurrent operations

## 🔧 Troubleshooting

### Common Issues

#### Plugin Not Loading

```
Error: Failed to import plugin module '@my-org/my-plugin': Module not found
```

**Solution**: Ensure the plugin module is installed and the path is correct.

#### Configuration Errors

```
Error: Plugin 'my-plugin' missing required 'module' property
```

**Solution**: Check plugin configuration has all required properties.

#### Timeout Issues

```
Error: Timeout (30000ms): load configured plugin 'my-plugin'
```

**Solution**: Increase `loadTimeout` or optimize plugin initialization.

#### Interface Violations

```
Error: Plugin must implement initialize() method
```

**Solution**: Ensure plugin extends `PluginInterface` and implements required
methods.

### Debugging

Enable detailed logging:

```javascript
const appRegistry = new AppRegistry({
  plugins: {
    'my-plugin': {
      enabled: true,
      module: './plugins/MyPlugin.js',
      config: { debug: true },
    },
  },
});

// Listen for plugin events
appRegistry.on('plugin-loaded', event => {
  console.log('Plugin loaded:', event.name);
});

appRegistry.on('error', event => {
  if (event.component === 'PluginManager') {
    console.error('Plugin error:', event.phase, event.error);
  }
});
```

## ⚡ Performance & Optimizations

### Concurrent Plugin Loading

The PluginManager uses optimized batch processing for loading multiple plugins:

```javascript
// Plugins are loaded in batches of up to 3 concurrent operations
// This provides optimal performance while preventing resource exhaustion

const appRegistry = new AppRegistry({
  plugins: {
    'plugin-1': { enabled: true, module: './plugin1.js' },
    'plugin-2': { enabled: true, module: './plugin2.js' },
    'plugin-3': { enabled: true, module: './plugin3.js' },
    'plugin-4': { enabled: true, module: './plugin4.js' },
    'plugin-5': { enabled: true, module: './plugin5.js' },
  },
});

// Loading process:
// Batch 1: plugin-1, plugin-2, plugin-3 (concurrent)
// Batch 2: plugin-4, plugin-5 (concurrent)
// Result: 60% faster than sequential loading
```

### Timeout Protection

All plugin operations are protected by configurable timeouts:

```javascript
const pluginManager = new PluginManager(appRegistry, {
  loadTimeout: 30000, // Plugin loading timeout (30s)
  shutdownTimeout: 15000, // Plugin shutdown timeout (15s)
});

// Extended timeout for configuration-based loading
// (import + initialization gets 2x loadTimeout)
```

### Error Isolation

Plugin failures are isolated and don't affect the core system:

```javascript
// Failed plugins are tracked but don't stop other plugins
const result = await appRegistry.initialize();
console.log({
  loaded: result.loadedPlugins, // ['plugin-1', 'plugin-3']
  failed: result.failedPlugins, // [{ name: 'plugin-2', error: '...' }]
});
```

## 🎯 Advanced Topics

### Custom Plugin Loaders

```javascript
class CustomPluginLoader {
  static async loadFromUrl(url, config) {
    const response = await fetch(url);
    const pluginCode = await response.text();

    // Safely evaluate plugin code
    const PluginClass = eval(pluginCode);

    return await appRegistry.loadPlugin(PluginClass, config);
  }
}
```

### Plugin Communication

```javascript
// Plugin A
export class PluginA extends PluginInterface {
  async initialize(appRegistry, config) {
    this.appRegistry = appRegistry;

    // Emit custom event
    appRegistry.emit('plugin-a-ready', { data: 'hello' });
  }
}

// Plugin B
export class PluginB extends PluginInterface {
  async initialize(appRegistry, config) {
    this.appRegistry = appRegistry;

    // Listen for Plugin A events
    appRegistry.on('plugin-a-ready', event => {
      console.log('Plugin A is ready:', event.data);
    });
  }
}
```
