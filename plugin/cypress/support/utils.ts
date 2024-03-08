export const isLocalhost = () => {
  return Cypress.config().baseUrl?.startsWith('http://localhost');
};

export const getApiProxy = () => {
  return isLocalhost() ? '' : '/api/proxy/plugin/ossmconsole/kiali';
};
