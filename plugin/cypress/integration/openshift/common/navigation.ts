import { Given, Then } from '@badeball/cypress-cucumber-preprocessor';
import { ensureKialiFinishedLoading } from '../../kiali/common/transition';

enum detailType {
  App = 'app',
  Workload = 'workload',
  Service = 'service'
}

Given('user is at the {string} list page', (page: string) => {
  // enable toggles on the list pages so that they can be tested
  cy.intercept(`${Cypress.config('baseUrl')}/api/config`, request => {
    request.reply(response => {
      response.body['kialiFeatureFlags']['uiDefaults']['list']['showIncludeToggles'] = true;
      return response;
    });
  }).as('config');

  // Forcing "Pause" to not cause unhandled promises from the browser when cypress is testing
  cy.visit(`${Cypress.config('baseUrl')}/${Cypress.env('BASE_PATH')}/${page}?refresh=0`);
  cy.wait('@config');
});

Given('user is at the {string} page', (page: string) => {
  // Forcing "Pause" to not cause unhandled promises from the browser when cypress is testing
  cy.visit(`${Cypress.config('baseUrl')}/${Cypress.env('BASE_PATH')}/${page}?refresh=0`);
});

Given(
  'user is at the details page for the {string} {string} located in the {string} cluster',
  (detail: detailType, namespacedNamed: string, cluster: string) => {
    const qs = {
      // Forcing "Pause" to not cause unhandled promises from the browser when cypress is testing
      refresh: '0'
    };
    if (cluster !== '') {
      qs['clusterName'] = cluster;
    }

    const namespaceAndName = namespacedNamed.split('/');
    const namespace = namespaceAndName[0];
    const name = namespaceAndName[1];
    const pageDetail = getPageDetail(detail);

    if (pageDetail === 'services') {
      cy.intercept({
        pathname: '**/api/namespaces/bookinfo/services/productpage',
        query: {
          objects: ''
        }
      }).as('waitForCall');
    }

    cy.visit(`${Cypress.config('baseUrl')}/k8s/ns/${namespace}/${pageDetail}/${name}/${Cypress.env('BASE_PATH')}`, {
      qs
    });

    ensureKialiFinishedLoading();
  }
);

const getPageDetail = (detail: detailType): string => {
  let pageDetail: string;
  switch (detail) {
    case detailType.App:
      pageDetail = 'deployments';
      break;
    case detailType.Service:
      pageDetail = 'services';
      break;
    case detailType.Workload:
      pageDetail = 'deployments';
      break;
  }
  return pageDetail;
};

// Then the browser is at the details page for the "<type>" "bookinfo/<name>" located in the "west" cluster
Given(
  'the browser is at the details page for the {string} {string} located in the {string} cluster',
  (detail: detailType, namespacedName: string, cluster: string) => {
    const namespaceAndName = namespacedName.split('/');
    const namespace = namespaceAndName[0];
    const name = namespaceAndName[1];
    const pageDetail = getPageDetail(detail);

    cy.url().should('include', `/namespaces/${namespace}/${pageDetail}/${name}`);
    cy.url().should('include', `clusterName=${cluster}`);
  }
);

// A simple function to check whether the DOM (or a subset of DOM has the cluster parameter in its links). This is related to multi-cluster testing.
export const clusterParameterExists = (present: boolean): void => {
  let exist = '';

  if (!present) {
    exist = 'not.';
  }

  cy.get('a').each($el => {
    cy.wrap($el).should('have.attr', 'href').and(`${exist}include`, 'clusterName=');
  });
};

Then(`user doesn't see the {string} menu`, menu => {
  cy.get('#page-sidebar').get(`#${menu}`).should('not.exist');
});

Then(`user see the {string} menu`, menu => {
  cy.get('#page-sidebar').get(`#${menu}`).should('exist');
});
