import { Given, Then, When } from "@badeball/cypress-cucumber-preprocessor";


Given('user is logged as administrator in OCP Console', () => {
    const user = Cypress.env('OC_CLUSTER_USER')
    // the two lines below can be done better, we don't need to check UI, in future we can hit API to check if user is logged in
    cy.visit('/') 
    cy.get('.co-username').should('contain', user)
});

When('user clicks on the Service Mesh icon in the left navigation bar', () => {
    cy.get('button.pf-c-nav__link').contains('Service Mesh').click().then(() => {
        cy.get('ul.pf-c-nav__list').should('be.visible')
    })
});

Then('buttons for Overview, Graph and Istio Config are displayed', () => {
    // cy.waitForReact(); // not sure why this is not working
    cy.get('a[data-test="nav"].pf-c-nav__link').contains('Overview')
    cy.get('a[data-test="nav"].pf-c-nav__link').contains('Graph')
    cy.get('a[data-test="nav"].pf-c-nav__link').contains('Istio Config')
})

Then('user is redirected to the OSSMC {string} page', (hrefName:string) => {
    switch (hrefName) {
        case 'Overview':
            cy.get('a[href*="/ossmconsole/overview"]').click().then(() => {
                cy.url().should('include', "/ossmconsole/overview")
            })
        case 'Graph':
            cy.get('a[href*="/ossmconsole/graph"]').click().then(() => {
                cy.url().should('include', "/ossmconsole/graph")
            })
        case 'Istio Config':
            cy.get('a[href*="/k8s/all-namespaces/istio"]').click().then(() => {})
    }
})