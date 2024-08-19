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
      getBySel(selector: string, ...args: any): Chainable<JQuery<HTMLElement>>;

      /**
       * Custom command to check if a DOM element has specific CSS variable
       * @param styleName the style name (e.g., color, margin, padding)
       * @param cssVarName the css variable name
       * @example cy.get(...).hasCssVar('color','--my-color')
       */
      hasCssVar(styleName: string, cssVarName: string): void;

      /**
       * Custom command to check text validation for inputs.
       * @param id the input identifier
       * @param text the text to validate
       * @param valid check if the text must be valid or invalid
       * @example cy.inputValidation('hostname','host',false)
       */
      inputValidation(id: string, text: string, valid: boolean): Chainable<Subject>;

      /**
       * Login to OCP with the given cluster username, password and identity provider
       * @param clusterUser the OpenShift cluster user
       * @param clusterPassword the OpenShift cluster password
       * @param identityProvider the identity provider
       */
      login(clusterUser?: string, clusterPassword?: string, identityProvider?: string): Chainable<void>;

      /**
       * Logout from Kiali
       */
      logout(): Chainable<Subject>;
    }
  }
}

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

Cypress.Commands.add('getBySel', (selector: string, ...args: any) => cy.get(`[data-test="${selector}"]`, ...args));

Cypress.Commands.add('inputValidation', (id: string, text: string, valid = true) => {
  cy.get(`input[id="${id}"]`).type(text);
  cy.get(`input[id="${id}"]`).should('have.attr', 'aria-invalid', `${!valid}`);
  cy.get(`input[id="${id}"]`).clear();
});

Cypress.Commands.add('hasCssVar', { prevSubject: true }, (subject, styleName, cssVarName) => {
  cy.document().then(doc => {
    const dummy = doc.createElement('span');
    dummy.style.setProperty(styleName, `var(${cssVarName})`);
    doc.body.appendChild(dummy);

    const evaluatedStyle = window.getComputedStyle(dummy).getPropertyValue(styleName).trim();
    dummy.remove();

    cy.wrap(subject)
      .then($el => window.getComputedStyle($el[0]).getPropertyValue(styleName).trim())
      .should('eq', evaluatedStyle);
  });
});

Cypress.Commands.add('inputValidation', (id: string, text: string, valid = true) => {
  cy.get(`input[id="${id}"]`).type(text);
  cy.get(`input[id="${id}"]`).should('have.attr', 'aria-invalid', `${!valid}`);
  cy.get(`input[id="${id}"]`).clear();
});

Cypress.Commands.add('hasCssVar', { prevSubject: true }, (subject, styleName, cssVarName) => {
  cy.document().then(doc => {
    const dummy = doc.createElement('span');
    dummy.style.setProperty(styleName, `var(${cssVarName})`);
    doc.body.appendChild(dummy);

    const evaluatedStyle = window.getComputedStyle(dummy).getPropertyValue(styleName).trim();
    dummy.remove();

    cy.wrap(subject)
      .then($el => window.getComputedStyle($el[0]).getPropertyValue(styleName).trim())
      .should('eq', evaluatedStyle);
  });
});

Cypress.Commands.overwrite('visit', (originalFn, url) => {
  cy.log('Navigate overwrite');
  originalFn(url);
});
