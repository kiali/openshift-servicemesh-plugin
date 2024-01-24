import { Given, Then, When } from "@badeball/cypress-cucumber-preprocessor";

When('cypress intercept hooks for workloads are registered', () => {
    // placeholder for future implementation (intercepting API calls for graphs etc)
});

When('user navigates into {string} page', (url:string) => {
    cy.visit(url)
});

When('user clicks tab with {string} button', (tabName:string) => {
    cy.get('button').contains(tabName).click()
});

When('user clicks on Service Mesh tab in horizontal nav', () => {
    cy.get('[data-test-id="horizontal-link-Service Mesh"]').contains('Service Mesh').click()
});

Then('user is able to see WorkloadDescriptionCard with Kiali Workload', () => {
    cy.get('[data-test="workload-description-card"]').contains('kiali').should('be.visible')
});

When('Kiali container is selected', () => {
    cy.get('[data-test="workload-logs-pod-containers"]').contains('kiali').click()
});

Then('user sees {string} dropdown', (dropdownText:string) => {
    cy.get('span.pf-c-dropdown__toggle-text').contains(dropdownText).should('be.visible')
});
