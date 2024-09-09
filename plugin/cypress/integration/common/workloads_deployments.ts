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

When(
  'user navigates to the {string} deployment details page in the namespace {string}',
  (deployment: string, namespace: string) => {
    cy.get('button[class$="c-nav__link"]')
      .contains('Workloads')
      .click()
      .then(() => {
        cy.get('a[class$="c-nav__link"]')
          .contains('Deployments')
          .click()
          .then(() => {
            cy.contains('span[class$="c-menu-toggle__text"]', 'Project:').click();
            cy.contains('span[class$="c-menu__item-text"]', namespace).click();
            cy.get('input[data-test-id="item-filter"]').type(deployment);
            cy.get(`[data-test-id="${deployment}"]`).click();
          });
      });
  }
);

When('user clicks tab with {string} button', (tabName: string) => {
  cy.get('button').contains(tabName).click();
});

When('user clicks on Service Mesh tab in horizontal nav', () => {
  cy.get('[data-test-id="horizontal-link-Service Mesh"]').contains('Service Mesh').click();
});

Then('user is able to see the WorkloadDescriptionCard with {string} Workload', (workload: string) => {
  cy.get('[data-test="workload-description-card"]').contains(workload).should('be.visible');
});

When('{string} container is selected', (container: string) => {
  cy.get('[data-test="workload-logs-pod-containers"]').contains(container).click();
});

Then('user sees {string} dropdown', (dropdownText: string) => {
  cy.get('span[class$="c-menu-toggle__text"]').contains(dropdownText).should('be.visible');
});
