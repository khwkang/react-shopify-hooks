module.exports = {
  plugins: ['react', 'react-hooks', 'jsx-a11y'],
  rules: {
    'no-var': 'warn',
    'no-unused-vars': 'warn',

    // react plugin - options
    'react/jsx-uses-react': 'warn',
    'react/jsx-uses-vars': 'warn',
    'react/jsx-key': 'warn',
    'react-hooks/rules-of-hooks': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
  },
  extends: ['plugin:jsx-a11y/recommended'],
  parser: 'babel-eslint',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 8, // optional, recommended 6+
  },
}
