export const isLocalhost = () => {
  return Cypress.config().baseUrl?.startsWith('http://localhost');
};
