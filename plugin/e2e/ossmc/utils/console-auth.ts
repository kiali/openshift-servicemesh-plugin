import { expect, type Page } from '@playwright/test';

type ConsoleLoginOptions = {
  authProvider?: string;
  password: string;
  username: string;
};

/**
 * OpenShift Console OAuth login (htpasswd IdP). OSSMC always runs inside the
 * OpenShift Console, so unlike standalone Kiali there is no auth-strategy
 * detection: the console itself requires a cluster login.
 *
 * The OAuth server (oauth-openshift.<domain>) is usually a different origin
 * than the console — Playwright follows cross-origin redirects natively, so no
 * special handling is needed beyond ignoreHTTPSErrors in the config.
 */
export async function loginOpenShiftConsole(
  page: Page,
  { authProvider, password, username }: ConsoleLoginOptions
): Promise<void> {
  if (!password) {
    throw new Error('Password is required for the OpenShift Console login. Set PLAYWRIGHT_PASSWD (or PASSWD).');
  }

  await page.goto('/');
  await clickAuthProviderIfPresent(page, authProvider);

  await page.locator('#inputUsername').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('#inputUsername').fill(username);
  await page.locator('#inputPassword').fill(password);
  await page.locator('button[type="submit"]').click();

  // Land back on the console after the OAuth redirect
  await expect(page).toHaveURL(/\/(console|ossmconsole)/, { timeout: 120_000 });
}

async function clickAuthProviderIfPresent(page: Page, authProvider?: string): Promise<void> {
  if (!authProvider) {
    return;
  }
  // The IdP list is rendered client-side after the console SPA boots, well
  // after the load event, so the click must wait for it (isVisible() returns
  // immediately and would silently skip the click). A click timeout means
  // there is no IdP selection page (active session or single-IdP redirect).
  const idp = page.getByRole('link', { name: authProvider, exact: true });
  await idp.click({ timeout: 15_000 }).catch(() => undefined);
}

export function consoleCredentials(): {
  authProvider: string;
  password: string;
  username: string;
} {
  return {
    username: process.env.PLAYWRIGHT_USERNAME ?? process.env.USERNAME ?? 'jenkins',
    password: process.env.PLAYWRIGHT_PASSWD ?? process.env.PASSWD ?? '',
    authProvider: process.env.PLAYWRIGHT_AUTH_PROVIDER ?? process.env.AUTH_PROVIDER ?? ''
  };
}
