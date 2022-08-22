// ***********************************************
// This commands.js file
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

import * as c from './const'

Cypress.Commands.add('openServiceMeshPage', () => {
  //clear local storage to ensure to be in default view = table
  cy.clearLocalStorage();
  cy.visit(c.url);
});
