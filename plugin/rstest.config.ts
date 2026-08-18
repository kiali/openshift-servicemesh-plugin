import { defineConfig } from '@rstest/core';
import { fleetMeshTestConfig } from './src/fleet-mesh/rstest.fleet-mesh.config';
import { liteTestConfig } from './src/lite/rstest.lite.config';

export default defineConfig({
  testEnvironment: 'jsdom',
  globals: true,
  include: ['src/openshift/**/*.test.{ts,tsx}', ...fleetMeshTestConfig.include, ...liteTestConfig.include],
  setupFiles: [...fleetMeshTestConfig.setupFiles, ...liteTestConfig.setupFiles],
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
      // React 17: @testing-library/react 14+ resolves react-dom/client, which doesn't exist before React 18.
      'react-dom/client': './src/kiali/test-shims/react-dom-client.cjs',
      ...fleetMeshTestConfig.resolve.alias,
      ...liteTestConfig.resolve.alias
    }
  }
});
