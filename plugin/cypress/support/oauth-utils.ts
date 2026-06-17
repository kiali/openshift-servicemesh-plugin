/**
 * OSSMC always runs on OpenShift, so the OAuth origin is derived from the
 * console's baseUrl using the standard OCP hostname pattern:
 *   console-openshift-console.<domain> → oauth-openshift.<domain>
 *
 * Set CYPRESS_OAUTH_ORIGIN to override for non-standard console hostnames.
 * Returns the baseUrl origin when neither heuristic matches (same-origin).
 */
export function discoverOAuthOrigin(): Cypress.Chainable<string> {
  const configBaseUrl = Cypress.config('baseUrl');
  if (!configBaseUrl) {
    throw new Error('Cypress baseUrl must be configured for OAuth origin discovery');
  }

  const baseUrl = new URL(configBaseUrl);
  const explicitOAuth: string | undefined = Cypress.env('OAUTH_ORIGIN') || undefined;

  if (explicitOAuth) {
    return cy.wrap(explicitOAuth, { log: false });
  }

  if (baseUrl.hostname.startsWith('console-openshift-console.')) {
    const oauthOrigin = `${baseUrl.protocol}//oauth-openshift.${baseUrl.hostname.replace('console-openshift-console.', '')}`;
    return cy.wrap(oauthOrigin, { log: false });
  }

  return cy.wrap(baseUrl.origin, { log: false });
}
