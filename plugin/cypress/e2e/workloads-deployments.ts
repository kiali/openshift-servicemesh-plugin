import { Before, Then, When } from '@badeball/cypress-cucumber-preprocessor';

Before(() => {
  // This prevents cypress from stopping on errors unrelated to the tests.
  // There can be random failures due timeouts/loadtime/framework that throw browser errors.  This
  // prevents a CI failure due something like a "slow".  There may be a better way to handle this.
  cy.on('uncaught:exception', (err, _runnable, promise) => {
    // when the exception originated from an unhandled promise
    // rejection, the promise is provided as a third argument
    // you can turn off failing the test in this case
    if (promise || err.message.includes('MobX')) {
      return false;
    }
    // we still want to ensure there are no other unexpected
    // errors, so we let them fail the test
  });
});

When('cypress intercept hooks for workloads are registered', () => {
  // placeholder for future implementation (intercepting API calls for graphs etc)
});

When('user navigates into {string} page', (url: string) => {
  cy.visit(url);
});

When('user clicks tab with {string} button', (tabName: string) => {
  cy.get('button').contains(tabName).click();
});

When('user clicks on Service Mesh tab in horizontal nav', () => {
  cy.get('[data-test-id="horizontal-link-Service Mesh"]').contains('Service Mesh').click();
});

Then('user is able to see WorkloadDescriptionCard with Kiali Workload', () => {
  cy.get('[data-test="workload-description-card"]').contains('kiali').should('be.visible');
});

When('Kiali container is selected', () => {
  cy.get('[data-test="workload-logs-pod-containers"]').contains('kiali').click();
});

Then('user sees {string} dropdown', (dropdownText: string) => {
  cy.get('span[class$="c-dropdown__toggle-text"]').contains(dropdownText).should('be.visible');
});
