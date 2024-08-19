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
