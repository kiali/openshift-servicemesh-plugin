import { expect, type Page } from '@playwright/test';

type ConsoleLoginOptions = {
  authProvider?: string;
  password: string;
  username: string;
};

/**
 * OpenShift Console OAuth login (htpasswd IdP). OSSMC always runs inside the
 * OpenShift Console, whose login state is separate from Kiali authentication.
 *
 * The OAuth server (oauth-openshift.<domain>) is usually a different origin
 * than the console — Playwright follows cross-origin redirects natively, so no
 * special handling is needed beyond ignoreHTTPSErrors in the config.
 *
 * A local Console started by start-console.sh runs with BRIDGE_USER_AUTH
 * disabled and never redirects to the OAuth server; credentials are only
 * required when the OAuth login page is actually shown.
 */
export async function loginOpenShiftConsole(
  page: Page,
  { authProvider, password, username }: ConsoleLoginOptions
): Promise<void> {
  await page.goto('/');

  // Console serves its shell before client-side authentication redirects finish.
  // Only the explicit server flag identifies an authentication-disabled bridge.
  const authDisabled = await page
    .evaluate(
      () => (window as Window & { SERVER_FLAGS?: { authDisabled?: boolean } }).SERVER_FLAGS?.authDisabled === true
    )
    .catch(() => false);
  if (authDisabled) {
    return;
  }

  const userMenu = page.locator('[data-test="user-dropdown-toggle"]');
  const usernameInput = page.locator('#inputUsername');
  const providerLink = authProvider ? page.getByRole('link', { name: authProvider, exact: true }) : undefined;
  const loginReady = providerLink ? userMenu.or(usernameInput).or(providerLink) : userMenu.or(usernameInput);
  await expect(loginReady.first()).toBeVisible({ timeout: 60_000 });
  if (await userMenu.isVisible()) {
    return;
  }

  if (providerLink && (await providerLink.isVisible())) {
    await providerLink.click();
    await expect(userMenu.or(usernameInput).first()).toBeVisible({ timeout: 60_000 });
    if (await userMenu.isVisible()) {
      return;
    }
  }

  if (!password) {
    throw new Error('Password is required for the OpenShift Console login. Set PLAYWRIGHT_PASSWD (or PASSWD).');
  }

  await usernameInput.fill(username);
  await page.locator('#inputPassword').fill(password);
  await page.locator('button[type="submit"]').click();

  // A Console URL alone does not confirm that the authenticated SPA is ready.
  await expect(userMenu).toBeVisible({ timeout: 120_000 });
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
