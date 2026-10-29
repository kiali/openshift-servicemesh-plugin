import { test } from '../fixtures/ossmcFixtures';
import { ensureDemoApp } from '../../utils/demoApps';
import { selectNamespace } from '../../utils/namespace';
import { core1 } from '../../utils/suite-tags';
import { ensureKialiHackScripts } from '../utils/hack-scripts';

test.describe('Kiali sidebar integration with OCP Console', () => {
  test.beforeAll(() => {
    ensureKialiHackScripts();
    ensureDemoApp('bookinfo');
  });

  test.beforeEach(async ({ ossmcSidebarPage }) => {
    await ossmcSidebarPage.open();
  });

  test('Service mesh buttons are displayed', core1, async ({ ossmcSidebarPage }) => {
    await ossmcSidebarPage.expectNavLinksDisplayed();
  });

  test('Overview page is displayed correctly', core1, async ({ ossmcSidebarPage }) => {
    await ossmcSidebarPage.navigateTo('Overview');
    await ossmcSidebarPage.expectOverviewCards();
  });

  test('Graph page is displayed correctly', core1, async ({ ossmcSidebarPage, page }) => {
    await ossmcSidebarPage.navigateTo('Traffic Graph');
    await selectNamespace(page, 'bookinfo');
    await ossmcSidebarPage.expectTrafficGraph('bookinfo');
  });

  test('Mesh page is displayed correctly', core1, async ({ ossmcSidebarPage, meshPage }) => {
    await ossmcSidebarPage.navigateTo('Mesh');
    await meshPage.expectMeshSidePanel();
  });

  test('Namespaces page is displayed correctly', core1, async ({ ossmcSidebarPage }) => {
    await ossmcSidebarPage.navigateTo('Namespaces');
    await ossmcSidebarPage.expectListHasRows();
  });

  test('Applications page is displayed correctly', core1, async ({ ossmcSidebarPage, page }) => {
    await ossmcSidebarPage.navigateTo('Applications');
    await selectNamespace(page, 'bookinfo');
    await ossmcSidebarPage.expectListHasRows();
  });

  test('Services page is displayed correctly', core1, async ({ ossmcSidebarPage, page }) => {
    await ossmcSidebarPage.navigateTo('Services');
    await selectNamespace(page, 'bookinfo');
    await ossmcSidebarPage.expectListHasRows();
  });

  test('Workloads page is displayed correctly', core1, async ({ ossmcSidebarPage, page }) => {
    await ossmcSidebarPage.navigateTo('Workloads');
    await selectNamespace(page, 'bookinfo');
    await ossmcSidebarPage.expectListHasRows();
  });

  test('Istio Config page is displayed correctly', core1, async ({ ossmcSidebarPage, page }) => {
    await ossmcSidebarPage.navigateTo('Istio Config');
    await selectNamespace(page, 'bookinfo');
    await ossmcSidebarPage.expectIstioConfigControls();
    await ossmcSidebarPage.expectListHasRows();
  });
});
