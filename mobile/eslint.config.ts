import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat';
import { fileURLToPath } from 'node:url';

export default defineConfig([
  expoConfig,
  {
    settings: { 'import/resolver': { typescript: { project: fileURLToPath(new URL('./tsconfig.json', import.meta.url)) } } },
  },
  {
    ignores: ['**/dist/**', '**/.expo/**', '**/expo-env.d.ts'],
  },
]);
