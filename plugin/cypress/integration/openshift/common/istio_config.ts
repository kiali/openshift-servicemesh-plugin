import { Given, Then, When } from '@badeball/cypress-cucumber-preprocessor';
import { getColWithRowText } from './table';
import { istioResources, referenceFor } from './istio_resources';
import { K8sGroupVersionKind } from '@openshift-console/dynamic-plugin-sdk';

Given('user is at the istio config list page', () => {
  // Forcing "Pause" to not cause unhandled promises from the browser when cypress is testing
  cy.visit({ url: `${Cypress.config('baseUrl')}/k8s/all-namespaces/istio?refresh=0` });
});

When('user selects the {string} project', (namespace: string) => {
  cy.contains('span[class*="c-menu-toggle__text"]', 'Project:').click();
  cy.contains('span[class*="c-menu__item-text"]', namespace).click();
});

Then('user sees Name information for Istio objects in ossmc', () => {
  const object = 'bookinfo-gateway';

  // There should be a table with a heading for each piece of information.
  getColWithRowText(object, 'name').within(() => {
    cy.get(`a[href*="/k8s/ns/bookinfo/networking.istio.io~v1~Gateway/${object}"]`).should('be.visible');
  });
});

Then('user sees Namespace information for Istio objects in ossmc', () => {
  const object = 'bookinfo-gateway';

  getColWithRowText(object, 'namespace').contains('bookinfo');
});

Then('user sees Type information for Istio objects in ossmc', () => {
  const object = 'bookinfo-gateway';

  getColWithRowText(object, 'kind').contains('Gateway');
});

Then('user sees Configuration information for Istio objects in ossmc', () => {
  const object = 'bookinfo-gateway';

  // There should be a table with a heading for each piece of information.
  getColWithRowText(object, 'configuration').within(() => {
    cy.get(`a[href*="/k8s/ns/bookinfo/networking.istio.io~v1~Gateway/${object}"]`).should('be.visible');
  });
});

Then('the user filters for {string}', (filterValue: string) => {
  // OCP 4.19 and earlier use the dropdown-button (and data-test-id="dropdown-button"), OCP 4.20 and later use the console-select-menu-toggle (and data-test)
  cy.get('[data-test-id="dropdown-button"], [data-test="console-select-menu-toggle"]').should('be.visible').click();
  cy.get('[id="NAME-link"]').click();

  cy.get('input[data-test-id="item-filter"]').type(`${filterValue}{enter}`);
});

Then('the user can create a {string} Istio object in ossmc', (object: string) => {
  cy.getBySel('item-create').click();

  const istioResource = istioResources.find(item => item.id.toLowerCase() === object.toLowerCase());

  cy.getBySel(`list-page-create-dropdown-item-${object}`).click();

  const page = `/k8s/ns/bookinfo/${referenceFor(istioResource as K8sGroupVersionKind)}/~new`;
  cy.url().should('include', page);
});

Then('the user can create a {string} K8s Istio object in ossmc', (object: string) => {
  cy.request({ method: 'GET', url: `/api/config` }).then(response => {
    expect(response.status).to.equal(200);
    const gatewayAPIEnabled = response.body.gatewayAPIEnabled;

    cy.getBySel('item-create').click();

    const istioResource = istioResources.find(item => item.id.toLowerCase() === object.toLowerCase());

    if (gatewayAPIEnabled) {
      cy.getBySel(`list-page-create-dropdown-item-${object}`).click();

      const page = `/k8s/ns/bookinfo/${referenceFor(istioResource as K8sGroupVersionKind)}/~new`;
      cy.url().should('include', page);
    } else {
      cy.getBySel(`list-page-create-dropdown-item-${object}`).should('not.exist');
    }
  });
});
