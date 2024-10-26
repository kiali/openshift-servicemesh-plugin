import { Then, When } from '@badeball/cypress-cucumber-preprocessor';

When('user is at the dashboard page', () => {
  cy.visit({ url: `/` });
});

When('user clicks on the Service Mesh icon in the left navigation bar', () => {
  cy.get('button[class*="pf-v5-c-nav__link"]')
    .contains('Service Mesh')
    .click()
    .then(() => {
      cy.get('ul[class="pf-v5-c-nav__list"]').should('be.visible');
    });
});

When('cypress intercept hooks for sidebar are registered', () => {
  cy.intercept(`**/api/istio/status?*`).as('overviewRequest');
  cy.intercept(`**/api/namespaces`).as('istioConfigRequest');
  cy.intercept(`**/api/namespaces/graph*`).as('graphNamespaces');
  cy.intercept(`**/api/mesh/graph?*`).as('meshRequest');
});

Then('buttons for Overview, Graph and Istio Config are displayed', () => {
  cy.waitForReact(5000, '#app', 'node_modules/resq/dist/index.js'); // Manually passing in the resq module path
  cy.reload(true); // force reload to make sure OSSMC is loaded
  cy.get('a[data-test="nav"][class*="pf-v5-c-nav__link"]').contains('Overview');
  cy.get('a[data-test="nav"][class*="pf-v5-c-nav__link"]').contains('Graph');
  cy.get('a[data-test="nav"][class*="pf-v5-c-nav__link"]').contains('Istio Config');
});

Then('user navigates to the OSSMC {string} page', (hrefName: string) => {
  switch (hrefName) {
    case 'Overview':
      cy.get('a[href*="/ossmconsole/overview"]')
        .click()
        .then(() => {
          cy.url().should('include', '/ossmconsole/overview');
        });
      break;
    case 'Graph':
      cy.get('a[href*="/ossmconsole/graph"]')
        .click()
        .then(() => {
          cy.url().should('include', '/ossmconsole/graph');
        });
      break;
    case 'Istio Config':
      cy.get('a[href*="/k8s/all-namespaces/istio"]')
        .click()
        .then(() => {
          cy.url().should('include', '/k8s/all-namespaces/istio');
        });
      break;
    case 'Mesh':
      cy.get('a[href*="/ossmconsole/mesh"]')
        .click()
        .then(() => {
          cy.url().should('include', '/ossmconsole/mesh');
        });
      break;
  }
});

Then('user sees istio-system overview card', () => {
  cy.wait('@overviewRequest').then(() => {
    cy.get('h5').contains('istio-system').should('be.visible');
  });
});

When('user selects the {string} namespace in the graph', (ns: string) => {
  cy.get('button#namespace-selector').click();
  cy.get('div[class="pf-v5-c-menu"]').contains('span', ns).parent('div').find('input').check();

  // Click outside the namespace selector to load the namespace graph
  cy.get('div#global-namespace-selector').click();
});

Then('user sees Istio Config page elements from Kiali', () => {
  cy.wait('@istioConfigRequest').then(() => {
    cy.get('[data-test-id="filter-dropdown-toggle"]').should('be.visible');
    cy.get('[data-test-id="dropdown-button"]').should('be.visible');
    cy.get('[data-test-id="item-filter"]').should('be.visible');
  });
});

Then(`user sees the {string} graph summary`, (ns: string) => {
  cy.wait('@graphNamespaces').then(() => {
    cy.get('div#summary-panel-graph-heading').find(`div#ns-${ns}`).should('be.visible');
  });
});

Then('user sees the mesh side panel', () => {
  cy.wait('@meshRequest').then(interception => {
    cy.get('#loading_kiali_spinner').should('not.exist');
    cy.get('#target-panel-mesh')
      .should('be.visible')
      .within(() => {
        const resp = interception.response;
        expect(resp?.statusCode).to.eq(200);
        expect(resp?.body.meshName).to.not.equal(undefined);
        expect(resp?.body.meshName).to.not.equal('');
        cy.contains(`Mesh Name: ${resp?.body.meshName}`);
      });
  });
});
