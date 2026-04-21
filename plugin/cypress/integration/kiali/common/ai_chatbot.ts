import { Then, When } from '@badeball/cypress-cucumber-preprocessor';
import {
  autoNavigatePayload,
  fileCreateYamlPayload,
  fileDeleteYamlPayload,
  filePatchYamlPayload,
  mockPayload,
  multipleActionsPayload,
  singleActionPayload
} from './ai_chatbot_mocks';
import { ensureKialiFinishedLoading } from './transition';

const CHATBOT_TOGGLE = '[data-test="ai-chatbot-toggle"]';
const CHATBOT_VISIBLE = '.pf-chatbot.pf-chatbot--visible';
const CHATBOT_HIDDEN = '.pf-chatbot.pf-chatbot--hidden';
const CHATBOT_WELCOME_TITLE = '.pf-chatbot__hello';
const CHATBOT_WELCOME_DESCRIPTION = '.pf-chatbot__question';
const CHATBOT_MESSAGE_INPUT = '[data-testid="chatbot-message-bar-input"]';
const CHATBOT_SEND_BUTTON = '.pf-chatbot__button--send';
const CHATBOT_SOURCES = '.pf-chatbot__source';
const CHATBOT_ALWAYS_NAVIGATE_SWITCH = '[data-testid="chatbot-always-navigate-switch"]';
const CHATBOT_NAVIGATION_ACTION = '[data-testid="chatbot-navigation-action"]';
const CHATBOT_NAVIGATION_ACTION_LINK = '[data-testid^="chatbot-navigation-action-link-"]';
/** PF6 / chatbot: file chip is a clickable button; truncated text omits the extension (e.g. vs-ai-cypress.yaml → vs-ai-cypress). */
const CHATBOT_FILE_ATTACHMENT_CONTENTS = '.pf-chatbot__file-label-contents';
const CHATBOT_YAML_MODAL = '[data-ouia-component-id="chatbot-yaml-modal"]';
const AI_CHATBOT_TEST_VS = 'vs-ai-cypress';
/** Istio Config list page uses VirtualList rows: data-test="VirtualItem_Ns{ns}_VirtualService_{name}" or VirtualItem_Cluster*_*Ns{ns}_VirtualService_{name}". */
const AI_CHATBOT_ISTIO_NS = 'bookinfo';

function virtualIstioConfigRowSelector(namespace: string, kind: string, name: string): string {
  return `[data-test*="_Ns${namespace}_${kind}_${name}"]`;
}

let lastResponseAlias = '';

function sendMessageWithMockedResponse(message: string, payload: object, alias: string): void {
  lastResponseAlias = alias;

  cy.intercept('POST', '**/api/chat/**/ai', {
    statusCode: 200,
    body: payload
  }).as(alias);

  cy.get(CHATBOT_MESSAGE_INPUT).type(message);
  cy.get(CHATBOT_SEND_BUTTON).click();
}

function waitForResponseAndValidateAnswer(alias: string, expectedAnswer: string): void {
  cy.wait(`@${alias}`, { timeout: 10000 })
    .its('response')
    .then(response => {
      expect(response.statusCode).to.eq(200);
    });

  cy.get(CHATBOT_VISIBLE, { timeout: 10000 }).should('contain.text', expectedAnswer);
}

Then('the AI chatbot toggle button should be visible', () => {
  cy.get(CHATBOT_TOGGLE).should('be.visible');
});

When('user clicks the AI chatbot toggle', () => {
  cy.get(CHATBOT_TOGGLE).click();
});

Then('the AI chatbot window should be open', () => {
  cy.get(CHATBOT_VISIBLE).should('exist');
});

Then('the AI chatbot window should be closed', () => {
  cy.get(CHATBOT_HIDDEN).should('exist');
});

Then('the AI chatbot should display a welcome message', () => {
  cy.get(CHATBOT_WELCOME_TITLE).should('be.visible').and('contain.text', 'Welcome to Kiali Chatbot');
  cy.get(CHATBOT_WELCOME_DESCRIPTION).should('be.visible').and('contain.text', 'How may I help you today?');
});

When('user sends a message {string}', (message: string) => {
  sendMessageWithMockedResponse(message, mockPayload, 'chatAIResponse');
});

Then('the AI chatbot should display a sources card', () => {
  cy.wait('@chatAIResponse', { timeout: 10000 })
    .its('response')
    .then(response => {
      expect(response.statusCode).to.eq(200);
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;

      const docs = body.referenced_docs;
      expect(docs).to.be.an('array').and.have.length.greaterThan(0);
      cy.wrap(docs.length).as('sourceCount');
    });

  cy.get('@sourceCount').then(count => {
    cy.get(CHATBOT_SOURCES, { timeout: 10000 }).should('exist').and('contain.text', `${count} sources`);
  });
});

function toggleAlwaysNavigateSwitch(enable: boolean): void {
  const current = enable ? 'not.be.checked' : 'be.checked';
  const expected = enable ? 'be.checked' : 'not.be.checked';

  cy.get(CHATBOT_ALWAYS_NAVIGATE_SWITCH).should('exist').and(current).click({ force: true });
  cy.get(CHATBOT_ALWAYS_NAVIGATE_SWITCH).should(expected);
}

Then('the always navigate switch should be unchecked', () => {
  cy.get(CHATBOT_ALWAYS_NAVIGATE_SWITCH).should('exist').and('not.be.checked');
});

When('user enables the always navigate switch', () => {
  toggleAlwaysNavigateSwitch(true);
});

When('user disables the always navigate switch', () => {
  toggleAlwaysNavigateSwitch(false);
});

When('user sends a message with actions {string}', (message: string) => {
  sendMessageWithMockedResponse(message, singleActionPayload, 'chatAIActionResponse');
});

When('user sends a message with multiple actions {string}', (message: string) => {
  sendMessageWithMockedResponse(message, multipleActionsPayload, 'chatAIActionResponse');
});

Then('the AI chatbot should display the answer {string}', (expectedAnswer: string) => {
  waitForResponseAndValidateAnswer(lastResponseAlias, expectedAnswer);
});

Then('the navigation actions container should be visible with {int} links', (count: number) => {
  cy.get(CHATBOT_NAVIGATION_ACTION, { timeout: 10000 })
    .should('exist')
    .within(() => {
      cy.get(CHATBOT_NAVIGATION_ACTION_LINK).should('have.length', count);
    });
});

When('user sends a message with auto navigate {string}', (message: string) => {
  sendMessageWithMockedResponse(message, autoNavigatePayload, 'chatAIAutoNavigateResponse');
});

Then('the navigation actions container should not be visible', () => {
  cy.get(CHATBOT_NAVIGATION_ACTION).should('not.exist');
});

Then('the URL should contain {string}', (path: string) => {
  cy.url().should('include', path);
});

When('user sends a message with YAML create action {string}', (message: string) => {
  sendMessageWithMockedResponse(message, fileCreateYamlPayload, 'chatAIYamlResponse');
});

When('user sends a message with YAML patch action {string}', (message: string) => {
  sendMessageWithMockedResponse(message, filePatchYamlPayload, 'chatAIYamlResponse');
});

When('user sends a message with YAML delete action {string}', (message: string) => {
  sendMessageWithMockedResponse(message, fileDeleteYamlPayload, 'chatAIYamlResponse');
});

When('user opens the chatbot YAML attachment {string}', (fileName: string) => {
  const baseName = fileName.lastIndexOf('.') > 0 ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  cy.get(CHATBOT_VISIBLE, { timeout: 10000 })
    .contains(CHATBOT_FILE_ATTACHMENT_CONTENTS, baseName)
    .parents('button.pf-m-clickable')
    .first()
    .click();
});

When('user confirms YAML create in the chatbot modal', () => {
  cy.intercept('POST', '**/api/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService', req => {
    req.continue();
  }).as('istioYamlApply');
  cy.get(CHATBOT_YAML_MODAL).should('be.visible');
  cy.get(CHATBOT_YAML_MODAL).within(() => {
    cy.contains('button', 'Create').click();
  });
});

When('user confirms YAML patch in the chatbot modal', () => {
  cy.intercept(
    'PATCH',
    '**/api/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService/vs-ai-cypress*',
    req => {
      req.continue();
    }
  ).as('istioYamlApply');
  cy.get(CHATBOT_YAML_MODAL).should('be.visible');
  cy.get(CHATBOT_YAML_MODAL).within(() => {
    cy.contains('button', 'Patch').click();
  });
});

When('user confirms YAML delete in the chatbot modal', () => {
  cy.intercept(
    'DELETE',
    '**/api/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService/vs-ai-cypress*',
    req => {
      req.continue();
    }
  ).as('istioYamlApply');
  cy.get(CHATBOT_YAML_MODAL).should('be.visible');
  cy.get(CHATBOT_YAML_MODAL).within(() => {
    cy.contains('button', 'Delete').click();
  });
});

Then('the Istio YAML apply request should succeed with method {string}', (method: string) => {
  cy.wait('@istioYamlApply', { timeout: 10000 }).then(interception => {
    expect(interception.response?.statusCode).to.eq(200);
    expect(interception.request.method).to.eq(method);
  });
});

Then('the AI chatbot should show YAML apply success for {string}', (operation: string) => {
  const label: Record<string, string> = {
    create: 'Successfully created',
    patch: 'Successfully patched',
    delete: 'Successfully deleted'
  };
  cy.get(CHATBOT_VISIBLE, { timeout: 10000 }).should('contain.text', label[operation]);
  cy.get(CHATBOT_VISIBLE).should('contain.text', AI_CHATBOT_TEST_VS);
});

When('user views the Istio Config list for namespaces {string}', (namespaces: string) => {
  cy.visit({
    url: `${Cypress.config('baseUrl')}/console/istio`,
    qs: { refresh: '0', namespaces }
  });
  ensureKialiFinishedLoading();
  cy.get('[data-test="refresh-button"]').click();
  ensureKialiFinishedLoading();
});

When(
  'user opens Istio Config details for VirtualService {string} in namespace {string}',
  (vsName: string, namespace: string) => {
    cy.visit({
      url: `${Cypress.config(
        'baseUrl'
      )}/console/namespaces/${namespace}/istio/networking.istio.io/v1/VirtualService/${vsName}`,
      qs: { refresh: '0' }
    });
    ensureKialiFinishedLoading();
  }
);

Then('user sees VirtualService {string} in the Istio Config list', (name: string) => {
  const rowSel = virtualIstioConfigRowSelector(AI_CHATBOT_ISTIO_NS, 'VirtualService', name);
  cy.get(rowSel, { timeout: 45000 }).should('exist').and('be.visible');
});

Then('user does not see VirtualService {string} in the Istio Config list', (name: string) => {
  const rowSel = virtualIstioConfigRowSelector(AI_CHATBOT_ISTIO_NS, 'VirtualService', name);
  cy.get('[data-test="refresh-button"]').click();
  ensureKialiFinishedLoading();
  cy.get(rowSel).should('not.exist');
});

Then('the Istio config YAML editor should contain {string}', (snippet: string) => {
  cy.get('#ace-editor', { timeout: 30000 }).should('be.visible');
  cy.window().then(win => {
    const w = win as Window & { ace?: { edit: (id: string) => { getValue: () => string } } };
    const editor = w.ace?.edit('ace-editor');
    expect(editor?.getValue() ?? '').to.include(snippet);
  });
});
