/**
 * This configuration ensures consistent code formatting across the entire project.
 * It follows modern JavaScript formatting standards with professional consistency.
 */

module.exports = {
  // Basic formatting
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',

  // Indentation
  tabWidth: 2,
  useTabs: false,

  // Line length
  printWidth: 100,

  // Spacing
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow functions
  arrowParens: 'avoid',

  // Line endings
  endOfLine: 'lf',

  // Quote properties
  quoteProps: 'as-needed',

  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',

  // HTML whitespace sensitivity (for any HTML in docs)
  htmlWhitespaceSensitivity: 'css',

  // Vue files (if any)
  vueIndentScriptAndStyle: false,

  // Override for specific file types
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
        tabWidth: 2,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 80,
        proseWrap: 'always',
        tabWidth: 2,
      },
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: '*.yaml',
      options: {
        tabWidth: 2,
        singleQuote: false,
      },
    },
    {
      files: 'package.json',
      options: {
        tabWidth: 2,
        printWidth: 120,
      },
    },
  ],
};
