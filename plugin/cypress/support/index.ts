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

import 'cypress-react-selector';
// Import commands.js using ES2015 syntax:
import './commands';

import './utils';

beforeEach(() => {
  cy.log('beforeEach');
  cy.session(
    'admin',
    () => {
      // additional check to make sure we are logged in can be here TODO
      cy.login();
    },
    {
      cacheAcrossSpecs: true
    }
  );
});
