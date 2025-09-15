/// <reference types="cypress" />

import { refForKialiIstio } from '../integration/openshift/common/istio_resources';

// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

declare global {
  namespace Cypress {
    interface Chainable<Subject> {
      /**
       * Custom command to select DOM element by the 'data-test' attribute.
       * @param selector the DOM element selector
       * @param args the rest of DOM element args
       * @example cy.getBySel('greeting')
       */
      getBySel(selector: string, ...args: any): Chainable<JQuery<HTMLElement>>;

      getColWithRowText(rowSearchText: string, colName: string): Chainable<JQuery<HTMLElement>>;

      /**
       * Custom command to check if a DOM element has specific CSS variable
       * @param styleName the style name (e.g., color, margin, padding)
       * @param cssVarName the css variable name
       * @example cy.get(...).hasCssVar('color','--my-color')
       */
      hasCssVar(styleName: string, cssVarName: string): void;

      /**
       * Custom command to check text validation for inputs.
       * @param id the input identifier
       * @param text the text to validate
       * @param valid check if the text must be valid or invalid
       * @example cy.inputValidation('hostname','host',false)
       */
      inputValidation(id: string, text: string, valid: boolean): Chainable<Subject>;

      /**
       * Login to OCP with the given cluster username, password and identity provider
       * @param clusterUser the OpenShift cluster user
       * @param clusterPassword the OpenShift cluster password
       * @param identityProvider the identity provider
       */
      login(clusterUser?: string, clusterPassword?: string, identityProvider?: string): Chainable<void>;

      /**
       * Logout from Kiali
       */
      logout(): Chainable<Subject>;
    }
  }
}

let csrfToken: string | undefined;

Cypress.Commands.add('login', (clusterUser, clusterPassword, identityProvider) => {
  const user = clusterUser || Cypress.env('USERNAME');
  const password = clusterPassword || Cypress.env('PASSWD');
  const idp = identityProvider || Cypress.env('AUTH_PROVIDER');

  cy.session(
    user,
    () => {
      cy.visit({ url: '/' }).then(() => {
        cy.log('AUTH_PROVIDER: ', typeof idp, JSON.stringify(idp));
        if (idp != undefined) {
          cy.get('[class*="c-button"]').contains(idp).click();
        }
        cy.get('#inputUsername').clear().type(user);
        cy.get('#inputPassword').clear().type(password);
        cy.get('button[type="submit"]').click();
        // wait till page loading after login
        cy.get("[data-test='username']").should('be.visible');
        guidedTour.close();
      });
    },
    {
      cacheAcrossSpecs: true,
      validate: () => {
        // Make an API request that returns a 200 only when logged in
        cy.request({ url: '/api/status' }).its('status').should('eq', 200);
      }
    }
  );

  if (!csrfToken) {
    // Store csrf-token value for non-GET request headers
    cy.getCookie('csrf-token').then(cookie => {
      csrfToken = cookie?.value;
    });
  }
});

//in case guided tour appears (OCP 4.19+)
export const guidedTour = {
  close: () => {
    cy.waitForReact();
    cy.get('body').then($body => {
      if ($body.find(`[data-test="guided-tour-modal"]`).length > 0) {
        cy.get(`[data-test="tour-step-footer-secondary"]`).contains('Skip tour').click();
      }
    });
  }
};

Cypress.Commands.add('getBySel', (selector: string, ...args: any) => cy.get(`[data-test="${selector}"]`, ...args));

Cypress.Commands.add('getColWithRowText', (rowSearchText: string, colName: string) =>
  cy
    .get('tbody')
    .contains('tr', rowSearchText)
    // Different selectors depending on Patternfly version
    // id="${colName}" for PF5, data-label="${colName}" for PF6
    .find(`td[id="${colName.toLowerCase()}"],td[data-label="${colName.toLowerCase()}"]`)
);

Cypress.Commands.add('inputValidation', (id: string, text: string, valid = true) => {
  cy.get(`input[id="${id}"]`).type(text);
  cy.get(`input[id="${id}"]`).should('have.attr', 'aria-invalid', `${!valid}`);
  cy.get(`input[id="${id}"]`).clear();
});

Cypress.Commands.add('hasCssVar', { prevSubject: true }, (subject, styleName, cssVarName) => {
  cy.document().then(doc => {
    const dummy = doc.createElement('span');
    dummy.style.setProperty(styleName, `var(${cssVarName})`);
    doc.body.appendChild(dummy);

    const evaluatedStyle = window.getComputedStyle(dummy).getPropertyValue(styleName).trim();
    dummy.remove();

    cy.wrap(subject)
      .then($el => window.getComputedStyle($el[0]).getPropertyValue(styleName).trim())
      .should('eq', evaluatedStyle);
  });
});

Cypress.Commands.add('inputValidation', (id: string, text: string, valid = true) => {
  cy.get(`input[id="${id}"]`).type(text);
  cy.get(`input[id="${id}"]`).should('have.attr', 'aria-invalid', `${!valid}`);
  cy.get(`input[id="${id}"]`).clear();
});

Cypress.Commands.add('hasCssVar', { prevSubject: true }, (subject, styleName, cssVarName) => {
  cy.document().then(doc => {
    const dummy = doc.createElement('span');
    dummy.style.setProperty(styleName, `var(${cssVarName})`);
    doc.body.appendChild(dummy);

    const evaluatedStyle = window.getComputedStyle(dummy).getPropertyValue(styleName).trim();
    dummy.remove();

    cy.wrap(subject)
      .then($el => window.getComputedStyle($el[0]).getPropertyValue(styleName).trim())
      .should('eq', evaluatedStyle);
  });
});

Cypress.Commands.overwrite('visit', (originalFn, visitUrl) => {
  const webParamsIndex = visitUrl.url.indexOf('?');
  const webParams = webParamsIndex > -1 ? visitUrl.url.substring(webParamsIndex) : '';

  const url = visitUrl.url.replace(Cypress.config('baseUrl'), '').split('?')[0].split('/');

  const targetPage = url[2];

  if (targetPage === 'namespaces') {
    const namespace = url[3];
    const type = url[4];
    const details = url[5];

    if (type === 'workloads') {
      // OpenShift Console doesn't have a "generic" workloads page
      // 99% of the cases there is a 1-to-1 mapping between Workload -> Deployment
      // YES, we have some old DeploymentConfig workloads there, but that can be addressed later
      visitUrl.url = `/k8s/ns/${namespace}/deployments/${details}/ossmconsole${webParams}`;
    } else if (type === 'services') {
      visitUrl.url = `/k8s/ns/${namespace}/services/${details}/ossmconsole${webParams}`;
    } else if (type === 'istio') {
      const istioUrl = refForKialiIstio(details);

      visitUrl.url = `/k8s/ns/${namespace}${istioUrl}/ossmconsole${webParams}`;
    } else if (type === 'pods') {
      visitUrl.url = `/k8s/ns/${namespace}/pods/${details}/ossmconsole${webParams}`;
    }
  } else {
    if (targetPage === 'graph') {
      visitUrl.url = visitUrl.url
        .replace('/console/graph/namespaces', '/ossmconsole/graph')
        .replace('/console/graph/node/namespaces', '/ossmconsole/graph/ns');
    } else if (targetPage === 'istio') {
      visitUrl.url = '/k8s/all-namespaces/istio';
    } else {
      visitUrl.url = visitUrl.url.replace('console/', 'ossmconsole/');
    }
  }

  return originalFn(visitUrl);
});

Cypress.Commands.overwrite('request', (originalFn, request) => {
  // don't overwrite specific requests to OSSMC plugin
  if (!request.url?.includes('ossmconsole')) {
    request.url = request.url?.replace('api/', 'api/proxy/plugin/ossmconsole/kiali/api/');
  }

  if (request.method !== 'GET') {
    request.headers = { 'X-CSRFToken': csrfToken };
  }

  return originalFn(request);
});
