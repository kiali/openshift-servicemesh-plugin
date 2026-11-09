import { test as kialiTest } from '../../fixtures/kialiFixtures';
import { OssmcSidebarPage } from '../pages/OssmcSidebarPage';

type OssmcFixtures = {
  ossmcSidebarPage: OssmcSidebarPage;
};

/**
 * OSSMC page-object fixtures, extending the vendored Kiali fixtures so specs
 * can use both the console navigation object and the embedded Kiali POMs.
 */
export const test = kialiTest.extend<OssmcFixtures>({
  ossmcSidebarPage: async ({ page }, use) => {
    await use(new OssmcSidebarPage(page));
  }
});

export { expect } from '@playwright/test';
