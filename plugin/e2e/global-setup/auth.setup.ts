import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { AUTH_FILE } from '../utils/auth';
import { consoleCredentials, loginOpenShiftConsole } from '../ossmc/utils/console-auth';

/**
 * Auth setup project — logs into the OpenShift Console via OAuth (htpasswd IdP)
 * and persists storageState for the suite projects. The Kiali API behind the
 * console proxy shares the console session, so no separate Kiali login exists.
 *
 * OSSMC runs on OpenShift only; there is no anonymous strategy to detect.
 */
setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const { username, password, authProvider } = consoleCredentials();
  await loginOpenShiftConsole(page, { authProvider, password, username });

  await page.context().storageState({ path: AUTH_FILE });
});
