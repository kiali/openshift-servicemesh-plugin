import { defineConfig } from 'cypress';
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';
import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';

export default defineConfig({
  viewportWidth: 1920,
  viewportHeight: 1080,
  defaultCommandTimeout: 40000,
  animationDistanceThreshold: 20,
  execTimeout: 150000,
  pageLoadTimeout: 90000,
  requestTimeout: 15000,
  responseTimeout: 15000,
  fixturesFolder: 'cypress/fixtures',
  chromeWebSecurity: true, // needs to disabled for cross origin requests
  screenshotsFolder: 'cypress/screenshots',
  videosFolder: 'cypress/videos',

  env: {
    USERNAME: 'kiali', // default value for jenkins
    AUTH_PROVIDER: 'my_htpasswd_provider', // default value for jenkins, can vary based on cluster setup
    BASE_PATH: 'ossmconsole', // default value for jenkins, can vary based on cluster setup
    API_PROXY: '/api/proxy/plugin/ossmconsole/kiali',
    'cypress-react-selector': {
      root: '#root'
    },
    cookie: false,
    omitFiltered: true,
    filterSpecs: true,
    tags: '@ossmc and not @skip-ossmc and not @multi-cluster and not @ambient'
  },

  e2e: {
    baseUrl: 'https://console-openshift-console.apps-crc.testing',
    async setupNodeEvents(
      on: Cypress.PluginEvents,
      config: Cypress.PluginConfigOptions
    ): Promise<Cypress.PluginConfigOptions> {
      // This is required for the preprocessor to be able to generate JSON reports after each run, and more,
      await addCucumberPreprocessorPlugin(on, config);

      on(
        'file:preprocessor',
        createBundler({
          plugins: [createEsbuildPlugin(config)]
        })
      );

      return config;
    },
    specPattern: '**/*.feature',
    supportFile: 'cypress/support/index.ts'
  }
});
