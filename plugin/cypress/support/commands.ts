/// <reference types="cypress" />

import { isLocalhost } from './utils';

// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

declare global {
  namespace Cypress {
    interface Chainable {
      login(USERNAME: string, PASSWD: string, AUTH_PROVIDER: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('login', (USERNAME, PASSWD, AUTH_PROVIDER) => {
  // Openshift Console from localhost does not have login page
  if (!isLocalhost()) {
    const user = USERNAME || Cypress.env('USERNAME');
    const password = PASSWD || Cypress.env('PASSWD');
    const idp = AUTH_PROVIDER || Cypress.env('AUTH_PROVIDER');

    cy.visit('/').then(() => {
      cy.log('AUTH_PROVIDER: ', typeof idp, JSON.stringify(idp));
      if (idp != undefined) {
        cy.get('[class*="c-button"]').contains(idp).click();
      }
      cy.get('#inputUsername').clear().type(user);
      cy.get('#inputPassword').clear().type(password);
      cy.get('button[type="submit"]').click();
    });
  }
});
