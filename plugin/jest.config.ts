import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } }
        }
      }
    ]
  },
  // Only OSSMC-specific code is tested here; vendored kiali/ tests use their own infrastructure.
  roots: ['<rootDir>/src/openshift'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  modulePaths: ['<rootDir>/src'],
  transformIgnorePatterns: ['node_modules/(?!lodash-es)'],
  moduleNameMapper: {
    '^app/(.*)$': '<rootDir>/src/kiali/app/$1',
    '^actions/(.*)$': '<rootDir>/src/kiali/actions/$1',
    '^components/(.*)$': '<rootDir>/src/kiali/components/$1',
    '^config$': '<rootDir>/src/kiali/config',
    '^config/(.*)$': '<rootDir>/src/kiali/config/$1',
    '^helpers/(.*)$': '<rootDir>/src/kiali/helpers/$1',
    '^hooks/(.*)$': '<rootDir>/src/kiali/hooks/$1',
    '^i18n$': '<rootDir>/src/openshift/i18n.ts',
    '^pages/(.*)$': '<rootDir>/src/kiali/pages/$1',
    '^reducers/(.*)$': '<rootDir>/src/kiali/reducers/$1',
    '^routes$': '<rootDir>/src/kiali/routes.tsx',
    '^routes/(.*)$': '<rootDir>/src/kiali/routes/$1',
    '^services/(.*)$': '<rootDir>/src/kiali/services/$1',
    '^store/(.*)$': '<rootDir>/src/kiali/store/$1',
    '^styles/(.*)$': '<rootDir>/src/kiali/styles/$1',
    '^types/(.*)$': '<rootDir>/src/kiali/types/$1',
    '^utils/(.*)$': '<rootDir>/src/kiali/utils/$1',
    '^@openshift-console/dynamic-plugin-sdk$': '<rootDir>/src/openshift/__mocks__/consoleSdkMock.ts',
    '\\.(svg|png|jpg|gif)$': '<rootDir>/src/openshift/__mocks__/fileMock.ts',
    '\\.scss$': '<rootDir>/src/openshift/__mocks__/styleMock.ts',
    '\\.css$': '<rootDir>/src/openshift/__mocks__/styleMock.ts'
  }
};

export default config;
