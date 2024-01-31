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
  screenshotsFolder: 'cypress/results/screenshots',
  videosFolder: 'cypress/results/videos',
  // videoUploadOnPasses: false, // this is not supported in cypress 13+, TODO add this back to config

  env: {
    OC_CLUSTER_USER: 'jenkins', // default value for jenkins
    OC_IDP: 'my_htpasswd_provider', // default value for jenkins, can vary based on cluster setup
    'cypress-react-selector': {
      root: '#root'
    },
    omitFiltered: true,
    filterSpecs: true
  },

  e2e: {
    baseUrl: 'http://localhost:9000',
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

      config.env.cookie = false;
      // config.env.AUTH_STRATEGY = await getAuthStrategy(config.baseUrl!); // TODO we are not using kiali api, rewrite this to use openshift API

      return config;
    },
    specPattern: '**/*.feature',
    supportFile: 'cypress/support/index.ts'
  }
});
