import { InputValidator } from './InputValidator';

/**
 * overrideComponents - Provides reusable component override functionality
 *
 * This module provides a simple function for component override management.
 * It provides comprehensive validation, flexible error handling, and detailed feedback.
 * This is pure reusable logic without domain-specific dependencies.
 *
 * @param {Object} componentRegistry - Component registry to modify
 * @param {Object} overrides - Object mapping component names to custom class constructors
 * @param {Object} [options={}] - Override options
 * @param {boolean} [options.strict=true] - If true, performs strict validation and throws on errors; if false, logs warnings
 * @param {string} [options.contextName='ComponentOverride'] - Context name for error messages
 * @throws {Error} When overrides is invalid or contains invalid components (in strict mode)
 * @returns {Object} Results object with successful, failed, and skipped arrays
 */
export function overrideComponents(componentRegistry, overrides, options = {}) {
  const { strict = true, contextName = 'ComponentOverride' } = options;

  // Validate overrides parameter
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    const error = new Error('Overrides must be a valid non-array object');
    if (strict) throw error;
    console.warn(`${contextName}.overrideComponents:`, error.message);
    return { successful: [], failed: [], skipped: [] };
  }

  const results = {
    successful: [],
    failed: [],
    skipped: [],
  };

  // Validate each override
  for (const [componentName, ComponentClass] of Object.entries(overrides)) {
    try {
      // Validate component name
      if (typeof componentName !== 'string' || componentName.trim().length === 0) {
        throw new Error(`Component name must be a non-empty string, got: ${typeof componentName}`);
      }

      // Check if the component name exists in component registry
      if (!(componentName in componentRegistry)) {
        throw new Error(
          `Unknown component '${componentName}'. Valid components are: ${Object.keys(componentRegistry).join(', ')}`
        );
      }

      // Validate component class
      if (!ComponentClass || typeof ComponentClass !== 'function') {
        throw new Error(
          `Component '${componentName}' must be a valid class constructor function, got: ${typeof ComponentClass}`
        );
      }

      // Validate component class if strict mode is enabled
      if (strict) {
        InputValidator.validateClass(ComponentClass, componentName);
      }

      // Apply the override to the component classes registry
      componentRegistry[componentName] = ComponentClass;
      results.successful.push({
        component: componentName,
        class: ComponentClass.name || '<Anonymous>',
      });
    } catch (error) {
      const failureInfo = { component: componentName, error: error.message };
      results.failed.push(failureInfo);

      if (strict) {
        throw new Error(`Failed to override component '${componentName}': ${error.message}`);
      }
      console.warn(
        `${contextName}.overrideComponents: Skipping '${componentName}':`,
        error.message
      );
    }
  }

  // Log summary in non-strict mode
  if (!strict && (results.successful.length > 0 || results.failed.length > 0)) {
    console.log(`${contextName}.overrideComponents summary:`, {
      successful: results.successful.length,
      failed: results.failed.length,
      details: results,
    });
  }

  return results;
}
