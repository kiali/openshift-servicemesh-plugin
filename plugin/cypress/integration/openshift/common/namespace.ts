export const selectNamespace = (namespace: string): void => {
  cy.contains('span[class$="c-menu-toggle__text"]', 'Project:').click();
  cy.contains('span[class$="c-menu__item-text"]', namespace).click();
};
