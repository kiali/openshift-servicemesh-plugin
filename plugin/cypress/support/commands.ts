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
    interface Chainable<Subject> {
      /**
       * Custom command to select DOM element by the 'data-test' attribute.
       * @param selector the DOM element selector
       * @param args the rest of DOM element args
       * @example cy.getBySel('greeting')
       */
      getBySel(selector: string, ...args: any): Chainable<Subject>;

      /**
       * Login to OCP with the given cluster username, password and identity provider
       * @param clusterUser the OpenShift cluster user
       * @param clusterPassword the OpenShift cluster password
       * @param identityProvider the identity provider
       */
      login(clusterUser?: string, clusterPassword?: string, identityProvider?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('getBySel', (selector: string, ...args: any) => cy.get(`[data-test="${selector}"]`, ...args));

Cypress.Commands.add('login', (clusterUser, clusterPassword, identityProvider) => {
  // Openshift Console from localhost does not have login page
  if (!isLocalhost()) {
    const user = clusterUser || Cypress.env('OC_CLUSTER_USER');
    const password = clusterPassword || Cypress.env('OC_CLUSTER_PASS');
    const idp = identityProvider || Cypress.env('OC_IDP');

    cy.visit('/').then(() => {
      cy.log('OC_IDP: ', typeof idp, JSON.stringify(idp));
      if (idp != undefined) {
        cy.get('.pf-c-button').contains(idp).click();
      }
      cy.get('#inputUsername').clear().type(user);
      cy.get('#inputPassword').clear().type(password);
      cy.get('button[type="submit"]').click();
    });
  }
});
