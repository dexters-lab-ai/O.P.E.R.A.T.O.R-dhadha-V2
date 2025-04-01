import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import nextCoreWebVitals from 'eslint-config-next';

export default [
eslint.configs.recommended, // Replaces 'eslint:recommended'
tseslint.configs.recommended, // Replaces 'plugin:@typescript-eslint/recommended'
nextCoreWebVitals.configs['core-web-vitals'], // Replaces 'next/core-web-vitals'
];
