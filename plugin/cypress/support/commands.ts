/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
declare global {
    namespace Cypress {
        interface Chainable {
            login(OC_CLUSTER_USER: string, OC_CLUSTER_PASS: string, OC_IDP: string): Chainable<void>
            //   drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
            //   dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
            //   visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
        }
    }
}

Cypress.Commands.add('login', (OC_CLUSTER_USER, OC_CLUSTER_PASS, OC_IDP) => {
    const user = OC_CLUSTER_USER || Cypress.env('OC_CLUSTER_USER')
    const password = OC_CLUSTER_PASS || Cypress.env('OC_CLUSTER_PASS')
    const idp = OC_IDP || Cypress.env('OC_IDP')

    cy.visit('/').then(() => {
        cy.log('OC_IDP: ', typeof (idp), JSON.stringify(idp))
        if (idp != undefined) {
            cy.get('.pf-c-button').contains(idp).click()
        }
        cy.get('#inputUsername').type(user)
        cy.get('#inputPassword').type(password)
        cy.get('button[type="submit"]').click();
    })
})