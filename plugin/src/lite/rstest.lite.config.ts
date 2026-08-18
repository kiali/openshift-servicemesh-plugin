// Self-contained rstest configuration for the lite subtree.
// The root rstest.config.ts imports this and merges it so that all
// lite test wiring stays in this subtree.
export const liteTestConfig = {
  include: ['src/lite/**/*.test.{ts,tsx}'],
  resolve: {
    alias: {
      'react-router-dom-v5-compat': './src/lite/__mocks__/routerMock.tsx'
    } as Record<string, string>
  },
  setupFiles: ['./src/lite/setupTests.tsx']
};
