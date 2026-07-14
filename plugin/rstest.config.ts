import { defineConfig } from '@rstest/core';
import { fleetMeshTestConfig } from './src/fleet-mesh/rstest.fleet-mesh.config';

export default defineConfig({
  testEnvironment: 'jsdom',
  globals: true,
  include: ['src/openshift/**/*.test.{ts,tsx}', ...fleetMeshTestConfig.include],
  setupFiles: fleetMeshTestConfig.setupFiles,
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
      '@openshift-console/dynamic-plugin-sdk': './src/__mocks__/consoleSdkMock.ts',
      ...fleetMeshTestConfig.resolve.alias
    }
  }
});
