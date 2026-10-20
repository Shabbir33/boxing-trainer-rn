// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // react-three-fiber JSX props (position, args, attach...) aren't DOM attributes.
    files: ['src/scene/**'],
    rules: { 'react/no-unknown-property': 'off' },
  },
]);
