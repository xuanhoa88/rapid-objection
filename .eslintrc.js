/**
 * This configuration provides comprehensive linting rules for the database engine
 * with support for ES modules, Node.js, Jest, and security best practices.
 */

module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },

  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'prettier', // Must be last to override other configs
  ],

  plugins: ['security', 'sonarjs'],

  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },

  globals: {
    __kModelCache: 'readonly',
  },

  rules: {
    // Critical errors only
    'no-debugger': 'error',
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'prefer-const': 'error',
    'no-var': 'error',

    // Error handling
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',

    // Code quality (relaxed)
    'no-duplicate-imports': 'error',
    'no-useless-return': 'warn',
    complexity: ['warn', 25], // Increased from 15
    'max-depth': ['warn', 8], // Increased from 4
    'max-params': ['warn', 8], // Increased from 5

    // Performance (warnings only)
    'no-await-in-loop': 'off', // Disabled - common in database operations
    'require-atomic-updates': 'off', // Disabled - false positives

    // Security (warnings only)
    'security/detect-object-injection': 'off', // Disabled - too many false positives
    'security/detect-non-literal-regexp': 'warn',

    // SonarJS rules (relaxed)
    'sonarjs/cognitive-complexity': 'off',
    'sonarjs/no-duplicate-string': ['warn', { threshold: 8 }], // Increased threshold
    'sonarjs/no-identical-functions': 'warn',
    'sonarjs/prefer-immediate-return': 'off', // Disabled - style preference

    // Modern JavaScript (warnings only)
    'prefer-destructuring': 'off', // Disabled - style preference
    'prefer-template': 'warn',
    'object-shorthand': 'warn',

    // Console and debugging
    'no-console': 'off', // Disabled - needed for logging

    // Node.js specific
    'node/no-unpublished-require': 'off',
    'node/no-unpublished-import': 'off', // Allow dev dependencies
    'node/no-missing-import': 'off', // Using ES modules
    'node/no-unsupported-features/es-syntax': 'off', // We target Node 16+
    'node/shebang': 'off', // Allow scripts without shebang
    'no-process-exit': 'off', // Allow process.exit in scripts
    'handle-callback-err': 'off', // Not using callbacks

    // Disable problematic TypeScript rules
    '@typescript-eslint/no-this-alias': 'off',
  },

  overrides: [
    // Configuration files
    {
      files: ['*.config.js'],
      rules: {
        'no-console': 'off',
      },
    },

    // Test files
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off',
        'max-lines-per-function': 'off',
        complexity: 'off',
        'max-depth': 'off',
        'max-params': 'off',
        'sonarjs/cognitive-complexity': 'off',
        'sonarjs/no-duplicate-string': 'off',
      },
    },

    // Example files
    {
      files: ['examples/**/*.js'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
