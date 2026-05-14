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
  env: {
    // USERNAME: 'kiali',
    // PASSWD: 'kiali',
    cookie: false,
    filterSpecs: true,
    omitFiltered: true,
    OSSMC: true,
    rootSelector: '#app'
  },
  e2e: {
    baseUrl: 'https://console-openshift-console.apps-crc.testing/',
    async setupNodeEvents(
      on: Cypress.PluginEvents,
      config: Cypress.PluginConfigOptions
    ): Promise<Cypress.PluginConfigOptions> {
      // This is required for the preprocessor to be able to generate JSON reports after each run, and more,
      await addCucumberPreprocessorPlugin(on, config);

      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        }
      });

      on(
        'file:preprocessor',
        createBundler({
          plugins: [createEsbuildPlugin(config)]
        })
      );

      config.env.AUTH_PROVIDER = config.env.AUTH_PROVIDER || 'my_htpasswd_provider';

      if (config.env.ALLOW_INSECURE_KIALI_API) {
        on('before:browser:launch', (browser, launchOptions) => {
          if (browser.family === 'chromium') {
            launchOptions.args.push('--ignore-certificate-errors');
          }
          if (browser.family === 'firefox') {
            launchOptions.preferences['security.enterprise_roots.enabled'] = true;
          }
          return launchOptions;
        });
      }

      return config;
    },
    specPattern: '**/*.feature',
    supportFile: 'cypress/support/index.ts',
    testIsolation: false
  }
});
