import { Before, Then } from '@badeball/cypress-cucumber-preprocessor';
import { getColWithRowText } from './table';
import { istioResources, referenceFor } from './istio_resources';
import { K8sGroupVersionKind } from '@openshift-console/dynamic-plugin-sdk';

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

Then('user sees all the Istio Config objects in the bookinfo namespace', () => {
  // There should be two Istio Config objects in the bookinfo namespace
  // represented by two rows in the table.
  cy.get('tbody').within(() => {
    // Bookinfo VS
    cy.get('tr').contains('bookinfo');

    // Bookinfo Gateway
    cy.get('tr').contains('bookinfo-gateway');
  });
});

Then('user sees Name information for Istio objects', () => {
  const object = 'bookinfo-gateway';

  // There should be a table with a heading for each piece of information.
  getColWithRowText(object, 'name').within(() => {
    cy.get(`a[href*="/k8s/ns/bookinfo/networking.istio.io~v1~Gateway/${object}"]`).should('be.visible');
  });
});

Then('user sees Namespace information for Istio objects', () => {
  const object = 'bookinfo-gateway';

  getColWithRowText(object, 'namespace').contains('bookinfo');
});

Then('user sees Type information for Istio objects', () => {
  const object = 'bookinfo-gateway';

  getColWithRowText(object, 'kind').contains('Gateway');
});

Then('user sees Configuration information for Istio objects', () => {
  const object = 'bookinfo-gateway';

  // There should be a table with a heading for each piece of information.
  getColWithRowText(object, 'configuration').within(() => {
    cy.get(`a[href*="/k8s/ns/bookinfo/networking.istio.io~v1~Gateway/${object}"]`).should('be.visible');
  });
});

Then('the user filters for {string}', (filterValue: string) => {
  cy.get('button[data-test-id="dropdown-button"]').click();
  cy.contains('button[data-test-id="dropdown-menu"]', 'Name').click();

  cy.get('input[data-test-id="item-filter"]').type(`${filterValue}{enter}`);
});

Then('user only sees {string}', (sees: string) => {
  cy.get('tbody').contains('tr', sees);

  cy.get('tbody').within(() => {
    cy.get('tr').should('have.length', 1);
  });
});

Then('the user can create a {string} Istio object', (object: string) => {
  cy.getBySel('item-create').find('button').click();

  const istioResource = istioResources.find(item => item.id.toLowerCase() === object.toLowerCase());

  cy.getBySel(`list-page-create-dropdown-item-${object}`).click();

  const page = `/k8s/ns/bookinfo/${referenceFor(istioResource as K8sGroupVersionKind)}/~new`;
  cy.url().should('include', page);
});

Then('the user can create a {string} K8s Istio object', (object: string) => {
  cy.request({ method: 'GET', url: `/api/config` }).then(response => {
    expect(response.status).to.equal(200);
    const gatewayAPIEnabled = response.body.gatewayAPIEnabled;

    cy.getBySel('item-create').find('button').click();

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
