// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';

// Registered globally rather than in a Cucumber Before hook so it also covers
// the auto-login beforeEach below, which runs before any suite-level hook.
Cypress.on('uncaught:exception', (err, _runnable, promise) => {
  // When the exception originated from an unhandled promise rejection, the
  // promise is provided as a third argument. Those, and MobX warnings, are
  // unrelated to the tests and should not fail them. Anything else still does.
  if (promise || err.message.includes('MobX')) {
    return false;
  }
});

const SKIP_AUTO_LOGIN_SPECS = ['kiali_login.feature'];

beforeEach((): void => {
  const specFile = Cypress.spec.relative.replace(/\\/g, '/');
  if (SKIP_AUTO_LOGIN_SPECS.some(name => specFile.endsWith(name))) {
    return;
  }

  cy.login();
});
