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
  cy.intercept(`**/api/clusters/apps*`).as('appsRequest');
  cy.intercept(`**/api/istio/config?*`).as('istioConfigRequest');
});

Then('Service Mesh buttons are displayed', () => {
  ['Overview', 'Traffic Graph', 'Mesh', 'Namespaces', 'Applications', 'Istio Config'].forEach(label => {
    cy.get('a[data-test="nav"]').contains(label).should('exist');
  });
});

When('user navigates to the OSSMC {string} page', (hrefName: string) => {
  const hrefMap: Record<string, string> = {
    Overview: 'overview',
    'Traffic Graph': 'graph',
    Mesh: 'mesh',
    Namespaces: 'namespaces',
    Applications: 'applications',
    'Istio Config': 'istio'
  };
  const path = hrefMap[hrefName];
  cy.get(`a[href*="/ossmconsole/${path}"]`)
    .click()
    .then(() => {
      cy.url().should('include', `/ossmconsole/${path}`);
    });
});

Then('user sees the overview cards', () => {
  cy.url().should('include', '/ossmconsole/overview');
  cy.wait('@overviewRequest').then(interception => {
    expect(interception.response?.statusCode).to.eq(200);
    cy.getBySel('clusters-card').should('be.visible');
    cy.getBySel('control-planes-card').should('be.visible');
    cy.getBySel('data-planes-card').should('be.visible');
  });
});

Then('user sees the namespaces list', () => {
  cy.url().should('include', '/ossmconsole/namespaces');
  cy.wait('@namespacesRequest').then(interception => {
    expect(interception.response?.statusCode).to.eq(200);
    cy.get('table').should('be.visible');
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
  });
});

Then('user sees the applications list', () => {
  cy.url().should('include', '/ossmconsole/applications');
  cy.wait('@appsRequest').then(interception => {
    expect(interception.response?.statusCode).to.eq(200);
    cy.get('table').should('be.visible');
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
  });
});

Then('user sees Istio Config list', () => {
  cy.url().should('include', '/ossmconsole/istio');
  cy.wait('@istioConfigRequest').then(interception => {
    expect(interception.response?.statusCode).to.eq(200);
    cy.getBySel('istio-actions-toggle').should('be.visible');
    cy.getBySel('refresh-button').should('be.visible');
    cy.get('table').should('be.visible');
  });
});

Then(`user sees the {string} traffic graph`, (ns: string) => {
  cy.url().should('include', '/ossmconsole/graph');
  cy.wait('@graphNamespaces').then(interception => {
    expect(interception.response?.statusCode).to.eq(200);
    cy.get('#pft-graph').should('be.visible');
    cy.get('div#summary-panel-graph-heading').find(`div#ns-${ns}`).should('be.visible');
  });
});

Then('user sees the mesh side panel', () => {
  cy.url().should('include', '/ossmconsole/mesh');
  cy.get('#mesh-container').should('be.visible');
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
