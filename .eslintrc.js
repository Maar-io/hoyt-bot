module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
    ],
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    env: {
      node: true,
      es6: true,
    },
    rules: {
      // Error prevention
      'no-console': 'off', // Allow console for this CLI app
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-constant-condition': ['error', { 'checkLoops': false }],
      
      // Best practices
      'eqeqeq': ['error', 'always', { 'null': 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-throw-literal': 'error',
      
      // Style
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { 'avoidEscape': true }],
      'max-len': ['warn', { 'code': 100, 'ignoreComments': true, 'ignoreStrings': true }],
      'comma-dangle': 'off', 
      
      // TypeScript-specific
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  };