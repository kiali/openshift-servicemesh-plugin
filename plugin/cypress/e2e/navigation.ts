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

When('cypress intercept hooks are registered', () => {
    cy.intercept('/api/proxy/plugin/ossmconsole/kiali/api/namespaces/istio-system/metrics?*').as('metricsRequest')
    cy.intercept('/api/proxy/plugin/ossmconsole/kiali/api/istio/status?*').as('overviewRequest')
    cy.intercept('/api/proxy/plugin/ossmconsole/kiali/api/namespaces').as('istioConfigRequest')
});

Then('buttons for Overview, Graph and Istio Config are displayed', () => {
    cy.waitForReact(5000, '#app', 'node_modules/resq/dist/index.js'); // Manually passing in the resq module path
    cy.reload(true) // force reload to make sure OSSMC is loaded 
    cy.get('a[data-test="nav"].pf-c-nav__link').contains('Overview')
    cy.get('a[data-test="nav"].pf-c-nav__link').contains('Graph')
    cy.get('a[data-test="nav"].pf-c-nav__link').contains('Istio Config')
});

Then('user is redirected to the OSSMC {string} page', (hrefName: string) => {
    switch (hrefName) {
        case 'Overview':
            cy.get('a[href*="/ossmconsole/overview"]').click().then(() => {
                cy.url().should('include', "/ossmconsole/overview")
            })
            break;
        case 'Graph':
            cy.get('a[href*="/ossmconsole/graph"]').click().then(() => {
                cy.url().should('include', "/ossmconsole/graph")
            })
            break;
        case 'Istio Config':
            cy.get('a[href*="/k8s/all-namespaces/istio"]').click().then(() => {
                cy.url().should('include', "/k8s/all-namespaces/istio")
            })
            break;
    }
});

Then('user sees memory and cpu charts from Kiali', () => {
    cy.wait('@metricsRequest').then(() => {
        cy.get('[data-test="memory-chart"]').should('be.visible')
        cy.get('[data-test="cpu-chart"]').should('be.visible')
    })
});

Then('user sees istio-system overview card', () => {
    cy.wait('@overviewRequest').then(() => {
        cy.get('h5').contains('istio-system').should('be.visible')
    })
});

Then('user sees Graph page elements from Kiali', () => {
    cy.get('[data-test="namespace-dropdown"]').should('be.visible')
    // not able to find correct request responsible for loading graph, simple smoke for now
});

Then('user sees Istio Config page elements from Kiali', () => {
    cy.wait('@istioConfigRequest').then(() => {
        cy.get('[data-test-id="filter-dropdown-toggle"]').should('be.visible')
        cy.get('[data-test-id="dropdown-button"]').should('be.visible')
        cy.get('[data-test-id="item-filter"]').should('be.visible')
    })
});
