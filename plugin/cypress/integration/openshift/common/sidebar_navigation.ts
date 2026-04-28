import { Then, When } from '@badeball/cypress-cucumber-preprocessor';

When('user is at the dashboard page', () => {
  cy.visit({ url: `/` });
});

When('user clicks on the Service Mesh icon in the left navigation bar', () => {
  cy.get('button[class*="c-nav__link"]')
    .contains('Service Mesh')
    .click()
    .then(() => {
      cy.get('ul[class*="c-nav__list"]').should('be.visible');
    });
});

When('cypress intercept hooks for sidebar are registered', () => {
  cy.intercept(`**/api/mesh/controlplanes`).as('overviewRequest');
  cy.intercept(`**/api/namespaces`).as('namespacesRequest');
  cy.intercept(`**/api/namespaces/graph*`).as('graphNamespaces');
  cy.intercept(`**/api/mesh/graph?*`).as('meshRequest');
  cy.intercept(`**/api/apps*`).as('appsRequest');
  cy.intercept(`**/api/istio/config?*`).as('istioConfigRequest');
});

Then('buttons for Overview, Graph, Namespaces, Applications and Istio Config are displayed', () => {
  cy.waitForReact();
  cy.reload(true); // force reload to make sure OSSMC is loaded
  cy.get('a[data-test="nav"][class*="c-nav__link"]').contains('Overview');
  cy.get('a[data-test="nav"][class*="c-nav__link"]').contains('Graph');
  cy.get('a[data-test="nav"][class*="c-nav__link"]').contains('Namespaces');
  cy.get('a[data-test="nav"][class*="c-nav__link"]').contains('Applications');
  cy.get('a[data-test="nav"][class*="c-nav__link"]').contains('Istio Config');
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
      cy.get('a[href*="/ossmconsole/istio"]')
        .click()
        .then(() => {
          cy.url().should('include', '/ossmconsole/istio');
        });
      break;
    case 'Namespaces':
      cy.get('a[href*="/ossmconsole/namespaces"]')
        .click()
        .then(() => {
          cy.url().should('include', '/ossmconsole/namespaces');
        });
      break;
    case 'Applications':
      cy.get('a[href*="/ossmconsole/applications"]')
        .click()
        .then(() => {
          cy.url().should('include', '/ossmconsole/applications');
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
  cy.get('div[class*="c-menu"]').contains('span', ns).parent('div').find('input').check();

  // Click outside the namespace selector to load the namespace graph
  cy.get('div#global-namespace-selector').click();
});

Then('user sees the namespaces list', () => {
  cy.wait('@namespacesRequest').then(() => {
    cy.get('table').should('be.visible');
  });
});

Then('user sees the applications list', () => {
  cy.wait('@appsRequest').then(() => {
    cy.get('table').should('be.visible');
  });
});

Then('user sees Istio Config page elements from Kiali', () => {
  cy.wait('@istioConfigRequest').then(() => {
    cy.get('button#namespace-selector').should('be.visible');
    cy.get('[data-test="istio-actions-toggle"]').should('be.visible');
  });
});

Then(`user sees the {string} graph summary`, (ns: string) => {
  cy.wait('@graphNamespaces').then(() => {
    cy.get('div#summary-panel-graph-heading').find(`div#ns-${ns}`).should('be.visible');
  });
});

Then('user sees the mesh side panel', () => {
  cy.wait('@meshRequest').then(interception => {
    cy.waitForReact();
    cy.get('#target-panel-mesh')
      .should('be.visible')
      .within(() => {
        const resp = interception.response;
        expect(resp?.statusCode).to.eq(200);
        expect(resp?.body.meshNames).to.not.equal(null);
        expect(resp?.body.meshNames.length).to.be.greaterThan(0);
        expect(resp?.body.meshNames).to.not.include('');
        // Check that each mesh name is displayed in the UI
        resp?.body.meshNames.forEach((meshName: string) => {
          cy.contains(`Mesh: ${meshName}`);
        });
      });
  });
});
