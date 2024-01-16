import { Then, When } from '@badeball/cypress-cucumber-preprocessor';

Then('oc is present on the system', () => {
    cy.exec('oc version').its('code').should('eq', 0);
});

Then('uninstall OSSMC if it is installed', () => {
    cy.exec('bash ./../hack/manage-ossmc.sh --uninstall').its('code').should('eq', 0);
});

Then('instruct the Kiali Operator to create a small OSSMConsole CR', () => {
    cy.exec('bash ./../hack/manage-ossmc.sh --install').its('stdout').should('eq', 'ossmconsole.kiali.io/ossmconsole created');
});

Then('wait for OSSMC to be ready', () => {
    cy.exec('bash ./../hack/manage-ossmc.sh --wait-ossmc').its('code').should('eq', 0);
});

Then('validate OSSMC custom resource by a script', () => {
    cy.exec('bash ./../hack/manage-ossmc.sh --validate-ossmc').its('code').should('eq', 0);
});

