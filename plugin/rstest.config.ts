import { defineConfig } from '@rstest/core';

export default defineConfig({
  testEnvironment: 'jsdom',
  globals: true,
  include: ['src/openshift/**/*.test.{ts,tsx}'],
  source: {
    tsconfigPath: './tsconfig.json'
  },
  tools: {
    swc: {
      jsc: {
        transform: {
          react: {
            runtime: 'automatic'
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      '@openshift-console/dynamic-plugin-sdk': './src/openshift/__mocks__/consoleSdkMock.ts'
    }
  }
});
