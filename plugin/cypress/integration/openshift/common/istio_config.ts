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

Then('the AuthorizationPolicy should have a {string} in ossmc', function (healthStatus: string) {
  waitUntilConfigIsVisible(
    5,
    this.targetAuthorizationPolicy,
    'AuthorizationPolicy',
    this.targetNamespace,
    healthStatus
  );
});

const hexToRgb = (hex: string): string => {
  const rValue = parseInt(hex.substring(0, 2), 16);
  const gValue = parseInt(hex.substring(2, 4), 16);
  const bValue = parseInt(hex.substring(4), 16);

  return `rgb(${rValue}, ${gValue}, ${bValue})`;
};

function waitUntilConfigIsVisible(
  retries: number,
  crdInstanceName: string,
  crdName: string,
  namespace: string,
  healthStatus: string
): void {
  cy.reload(true);
  cy.waitForReact();

  let found = false;
  // Get the link of the item name to distinguish each row
  // Different selectors depending on Patternfly version
  // id="name" for PF5, data-label="name" for PF6
  cy.get('td[id="name"] a,td[data-label="name"] a')
    .each($link => {
      const hRefAttr = $link[0].attributes.getNamedItem('href');

      if (hRefAttr !== null) {
        const istioResource = istioResources.find(item => item.id.toLowerCase() === crdName.toLowerCase());

        if (
          istioResource &&
          hRefAttr.value ===
            `/k8s/ns/${namespace}/${referenceFor(istioResource as K8sGroupVersionKind)}/${crdInstanceName}/ossmconsole`
        ) {
          // Get the row to check the configuration icon
          cy.wrap($link)
            .parent()
            .parent()
            .then($row => {
              const hasNA = $row[0].innerText.includes('N/A');

              if (!hasNA) {
                cy.wrap($row)
                  .find('span.pf-v5-c-icon')
                  .should('be.visible')
                  .then(icon => {
                    const colorVar = `--pf-v5-global--${healthStatus}-color--100`;
                    const statusColor = getComputedStyle(icon[0]).getPropertyValue(colorVar).replace('#', '');

                    cy.wrap(icon[0])
                      .invoke('css', 'color')
                      .then(iconColor => {
                        // Convert the status color to RGB format to compare it with the icon color
                        if (iconColor?.toString() === hexToRgb(statusColor)) {
                          found = true;
                        }
                      });
                  });
              }
            });
        }
      }
    })
    .then(() => {
      if (!found) {
        if (retries === 0) {
          throw new Error(`Condition not met after retries`);
        } else {
          cy.wait(10000);
          waitUntilConfigIsVisible(retries - 1, crdInstanceName, crdName, namespace, healthStatus);
        }
      }
    });
}

Then(
  'the {string} {string} of the {string} namespace should have a {string} in ossmc',
  (crdInstanceName: string, crdName: string, namespace: string, healthStatus: string) => {
    waitUntilConfigIsVisible(5, crdInstanceName, crdName, namespace, healthStatus);
  }
);
