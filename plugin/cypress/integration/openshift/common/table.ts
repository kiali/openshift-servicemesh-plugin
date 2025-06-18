// getColWithRowText will find the column matching the unique row text and column header name.
// This func makes a couple assumptions:
//
// 1. The text to search for is unique in the row.
// 2. There is only 1 table on the screen.
//
// Be aware of these assumptions when using this func.
export const getColWithRowText = (rowSearchText: string, colName: string): Cypress.Chainable => {
  // Different selectors depending on Patternfly version
  // id="${colName}" for PF5, data-label="${colName}" for PF6
  return cy.get('tbody').contains('tr', rowSearchText).find(`td[id="${colName}"],td[data-label="${colName}"]`);
};
