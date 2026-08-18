// Self-contained rstest configuration for the fleet-mesh subtree.
// The root rstest.config.ts imports this and merges it so that all
// fleet-mesh test wiring stays in this subtree.
export const fleetMeshTestConfig = {
  include: ['src/fleet-mesh/**/*.test.{ts,tsx}'],
  setupFiles: ['./src/fleet-mesh/setupTests.tsx'],
  resolve: {
    alias: {
      '@patternfly/react-charts/victory': './src/fleet-mesh/__mocks__/chartsMock.tsx',
      '@stolostron/multicluster-sdk': './src/fleet-mesh/__mocks__/multiclusterSdkMock.tsx',
      'react-router-dom-v5-compat': './src/fleet-mesh/__mocks__/routerMock.tsx'
    }
  }
};
