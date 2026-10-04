// Backend lint. Scope: catch real bugs (typo'd variables, unreachable code,
// promises that silently swallow errors), not formatting. Style is deliberately
// left alone so this stays useful rather than noisy.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'jplag/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // An unused argument is usually deliberate (Express error handlers need
      // all four); an unused *variable* is usually a leftover or a typo.
      'no-unused-vars': ['error', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
      // `catch {}` with no body hides failures. Require at least a comment.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // A BOM inside a regex is how we strip BOMs from Excel exports — legitimate.
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
      'no-console': 'off',
    },
  },
];
