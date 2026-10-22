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
  const idp = page.getByText(authProvider, { exact: true });
  if (await idp.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await idp.click();
  }
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
