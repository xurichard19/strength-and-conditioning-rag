import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat';

export default defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', '.expo/**', 'expo-env.d.ts'],
  },
]);
