import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        ignores: ['node_modules/', '*.min.js']
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                chrome: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                Promise: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', { 
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true,
                caughtErrors: 'none'
            }],
            'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'],
            'brace-style': ['error', '1tbs'],
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'never']
        }
    },
    {
        files: ['eslint.config.js'],
        languageOptions: {
            globals: {
                process: 'readonly'
            }
        }
    }
];
