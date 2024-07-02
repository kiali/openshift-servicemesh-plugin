import { Then } from '@badeball/cypress-cucumber-preprocessor';

Then('oc is present on the system', () => {
  cy.exec('oc version').its('code').should('eq', 0);
});

Then('uninstall OSSMC if it is installed', () => {
  cy.exec('bash ./../hack/manage-ossmc.sh --uninstall', { timeout: 60000 }).its('code').should('eq', 0);
});

Then('instruct the Kiali Operator to create a small OSSMConsole CR', () => {
  cy.exec('bash ./../hack/manage-ossmc.sh --install', { timeout: 60000 })
    .its('stdout')
    .should('eq', 'ossmconsole.kiali.io/ossmconsole created');
});

Then('wait for OSSMC to be ready', () => {
  cy.exec('bash ./../hack/manage-ossmc.sh --wait-ossmc', { timeout: 60000 }).its('code').should('eq', 0);
});

Then('validate OSSMC custom resource by a script', () => {
  cy.exec('bash ./../hack/manage-ossmc.sh --validate-ossmc', { timeout: 60000 }).its('code').should('eq', 0);
});

Then('uninstallation scripts to clean OSSMC resources is successful', () => {
  cy.exec('bash ./../hack/manage-ossmc.sh --uninstall', { timeout: 60000 })
    .its('stdout')
    .should('eq', 'ossmconsole.kiali.io "ossmconsole" deleted');
});
