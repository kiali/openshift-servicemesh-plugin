import { Given } from '@badeball/cypress-cucumber-preprocessor';
import { isLocalhost } from '../utils';

Given('user is logged as administrator in OCP Console', () => {
  const user = Cypress.env('OC_CLUSTER_USER');
  // the two lines below can be done better, we don't need to check UI, in future we can hit API to check if user is logged in
  cy.visit('/');

  if (!isLocalhost()) {
    cy.get('.co-username').should('contain', user);
  }
});
