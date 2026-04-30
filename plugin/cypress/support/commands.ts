import { buildNodeTree, findComponentsInTree, getReactFiber, isReactRoot, ReactNode, ReactOpts } from './react-utils';

// ***********************************************
// Custom Cypress commands for Kiali testing.
// https://on.cypress.io/custom-commands
// ***********************************************

declare global {
  interface Window {
    __REACT_LOADED__?: boolean;
    __REACT_ROOT_FIBER__?: any;
  }

  namespace Cypress {
    interface Chainable<Subject> {
      /**
       * Custom command to select DOM element by the 'data-test' attribute.
       * @param selector the DOM element selector
       * @param args the rest of DOM element args
       * @example cy.getBySel('greeting')
       */
      getBySel(selector: string, ...args: any): Chainable<JQuery<HTMLElement>>;

      /**
       * Custom command to get a table cell by row text and column name.
       * @param rowSearchText the text to search for in the row
       * @param colName the column name to get the cell from
       * @example cy.getColWithRowText('my-service', 'Status')
       */
      getColWithRowText(rowSearchText: string, colName: string): Chainable<JQuery<HTMLElement>>;

      /**
       * Get the current state of a React component.
       * Must be chained from a ReactNode (from getReact).
       * @example cy.getReact('MyComponent').then(c => c[0]).getCurrentState()
       */
      getCurrentState(): Chainable<any>;

      /**
       * Get props from a React component. Optionally get a specific prop by name.
       * Must be chained from a ReactNode (from getReact).
       * @param propName - Optional name of specific prop to retrieve
       * @example cy.getReact('MyComponent').then(c => c[0]).getProps()
       * @example cy.getReact('MyComponent').then(c => c[0]).getProps('onClick')
       */
      getProps(propName?: string): Chainable<any>;

      /**
       * Get React components by component name, props, and/or state.
       * Compatible with React 16, 17, and 18.
       * @param componentName - Name of the React component (supports wildcards like *oint)
       * @param reactOpts - Options to filter by props, state, etc.
       * @example cy.getReact('MyComponent')
       * @example cy.getReact('GraphPageComponent', { state: { isReady: true } })
       * @example cy.getReact('Button', { props: { disabled: false } })
       */
      getReact(componentName: string, reactOpts?: ReactOpts): Chainable<ReactNode[]>;

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

      /**
       * Get the nth element from an array of React nodes.
       * @param index - The index of the element to get
       * @example cy.getReact('MyComponent').nthNode(0)
       */
      nthNode(index: number): Chainable<ReactNode>;

      /**
       * Wait for React to be loaded on the page.
       * Compatible with React 16, 17, and 18.
       * @param timeout - Maximum time to wait in milliseconds (default: 30000)
       * @param reactRoot - CSS selector for React root element (default: '#root')
       * @example cy.waitForReact()
       * @example cy.waitForReact(60000, '#app')
       */
      waitForReact(timeout?: number, reactRoot?: string): Chainable<void>;
    }
  }
}

//in case guided tour appears (OCP 4.19+)
export const guidedTour = {
  close: () => {
    cy.waitForReact();
    // wait a little bit for the guided tour modal to appear
    cy.wait(5000);
    cy.get('body').then($body => {
      if ($body.find(`[data-test="guided-tour-modal"]`).length > 0) {
        cy.get(`[data-test="tour-step-footer-secondary"]`).contains('Skip tour').click();
      }
    });
  }
};

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
        cy.get("[data-test-id='dashboard']").should('be.visible');
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

  const url = visitUrl.url
    .replace(Cypress.config('baseUrl') ?? '', '')
    .split('?')[0]
    .split('/');

  const targetPage = url[2];

  if (targetPage === 'namespaces') {
    const namespace = url[3];

    if (namespace) {
      const type = url[4];
      const details = url.slice(5).join('/');

      if (type === 'workloads') {
        visitUrl.url = `/k8s/ns/${namespace}/deployments/${details}/ossmconsole${webParams}`;
      } else if (type === 'services') {
        visitUrl.url = `/k8s/ns/${namespace}/services/${details}/ossmconsole${webParams}`;
      } else if (type === 'applications') {
        visitUrl.url = `/k8s/ns/${namespace}/pods?label=app%3D${details}`;
      } else if (type === 'istio') {
        const istioUrl = refForKialiIstio(details);

        visitUrl.url = `/k8s/ns/${namespace}${istioUrl}/ossmconsole${webParams}`;
      } else if (type === 'pods') {
        visitUrl.url = `/k8s/ns/${namespace}/pods/${details}/ossmconsole${webParams}`;
      } else {
        visitUrl.url = `/ossmconsole/namespaces/${namespace}${type ? `/${type}` : ''}${
          details ? `/${details}` : ''
        }${webParams}`;
      }
    } else {
      visitUrl.url = `/ossmconsole/namespaces${webParams}`;
    }
  } else if (targetPage === 'graph') {
    visitUrl.url = visitUrl.url
      .replace('/console/graph/node/namespaces', '/ossmconsole/graph/ns')
      .replace('/console/graph/namespaces', '/ossmconsole/graph');
  } else if (targetPage === 'istio') {
    visitUrl.url = `/ossmconsole/istio${webParams}`;
  } else {
    visitUrl.url = visitUrl.url.replace('console/', 'ossmconsole/');
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

Cypress.Commands.add('waitForReact', (waitTimeout = 30000, reactRoot?: string) => {
  const checkInterval = 200;
  const startTime = Date.now();

  // Use provided root, or configured rootSelector, or body as fallback
  const rootSelector = reactRoot || Cypress.env('rootSelector') || 'body';

  cy.log(`Waiting for page to be ready (root: ${rootSelector})...`);

  const waitForRoot = (): void => {
    cy.document({ log: false }).then(doc => {
      const rootEl = doc.querySelector(rootSelector);

      if (rootEl && isReactRoot(rootEl)) {
        const fiber = getReactFiber(rootEl);
        if (fiber) {
          cy.window({ log: false }).then((win: Window) => {
            win.__REACT_ROOT_FIBER__ = fiber;
            win.__REACT_LOADED__ = true;
          });
          cy.log(`Page ready (React root found at "${rootSelector}")`);
          return;
        }
      }

      // Fallback: just check if page has rendered content
      const hasContent = doc.body && doc.body.children.length > 0;
      if (hasContent && Date.now() - startTime > 5000) {
        cy.window({ log: false }).then((win: Window) => {
          win.__REACT_LOADED__ = true;
        });
        cy.log('Page ready (content loaded)');
        return;
      }

      if (Date.now() - startTime > waitTimeout) {
        cy.window({ log: false }).then((win: Window) => {
          win.__REACT_LOADED__ = true;
        });
        cy.log('Page ready (timeout reached, proceeding)');
        return;
      }

      cy.wait(checkInterval, { log: false }).then(() => waitForRoot());
    });
  };

  waitForRoot();
});

Cypress.Commands.add('getReact', (componentName: string, reactOpts: ReactOpts = {}) => {
  const cmdTimeout = reactOpts.options?.timeout || Cypress.config('defaultCommandTimeout');
  const checkInterval = 100;
  let retries = Math.floor(cmdTimeout / checkInterval);

  cy.log(`Finding React component: ${componentName}`);

  const findComponents = (): Cypress.Chainable<ReactNode[]> => {
    return cy.window({ log: false }).then((win: Window) => {
      if (!win.__REACT_LOADED__) {
        throw new Error('getReact: React not loaded. Did you call cy.waitForReact()?');
      }

      const rootFiber = win.__REACT_ROOT_FIBER__;
      if (!rootFiber) {
        throw new Error('getReact: React fiber root not found');
      }

      const tree = buildNodeTree(rootFiber);
      return findComponentsInTree(tree, componentName, reactOpts);
    });
  };

  const resolveValue = (): Cypress.Chainable<any> => {
    return findComponents().then(results => {
      if (results.length > 0) {
        return cy.wrap(results);
      }

      if (retries < 1) {
        cy.log(`Component "${componentName}" not found`);
        return cy.wrap([]);
      }

      retries--;
      return cy.wait(checkInterval, { log: false }).then(() => resolveValue());
    });
  };

  return resolveValue();
});

// Get the current state of a React component (child command)
Cypress.Commands.add('getCurrentState', { prevSubject: true }, (subject: ReactNode) => {
  if (!subject || typeof subject !== 'object') {
    throw new Error('getCurrentState: subject must be a ReactNode object');
  }

  cy.log('Getting current state');
  return cy.wrap(subject.state);
});

// Get props from a React component (child command)
Cypress.Commands.add('getProps', { prevSubject: true }, (subject: ReactNode, propName?: string) => {
  if (!subject || typeof subject !== 'object') {
    throw new Error('getProps: subject must be a ReactNode object');
  }

  cy.log(`Getting props${propName ? `: ${propName}` : ''}`);

  if (propName) {
    return cy.wrap(subject.props?.[propName]);
  }
  return cy.wrap(subject.props);
});

// Get the nth element from an array of React nodes (child command)
Cypress.Commands.add('nthNode', { prevSubject: true }, (subject: ReactNode[], index: number) => {
  if (!Array.isArray(subject)) {
    throw new Error('nthNode: subject must be an array of ReactNode objects');
  }

  cy.log(`Getting node at index ${index}`);
  return cy.wrap(subject[index]);
});
