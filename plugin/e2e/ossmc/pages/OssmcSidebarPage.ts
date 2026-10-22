import { expect, type Locator } from '@playwright/test';

import { BasePage } from '../../pages/BasePage';

const OSSMC_PAGES = {
  Applications: 'applications',
  'Istio Config': 'istio',
  Mesh: 'mesh',
  Namespaces: 'namespaces',
  Overview: 'overview',
  Services: 'services',
  'Traffic Graph': 'graph',
  Workloads: 'workloads'
} as const;

export type OssmcPageName = keyof typeof OSSMC_PAGES;

/**
 * Navigation within the OpenShift Console left sidebar for the OSSMC plugin
 * (the /ossmconsole routes). The console owns this markup, so its selectors
 * differ from the embedded Kiali UI covered by the vendored page objects.
 */
export class OssmcSidebarPage extends BasePage {
  /** Land on the console home and open the Service Mesh nav section. */
  async open(): Promise<void> {
    await this.page.goto('/');
    await this.dismissGuidedTour();
    await this.openServiceMeshNav();
  }

  /** The Kiali guided tour shows on the first visit for a user; skip it when present. */
  private async dismissGuidedTour(): Promise<void> {
    const modal = this.getBySel('guided-tour-modal');
    if (await modal.isVisible()) {
      await this.getBySel('tour-step-footer-secondary').getByText('Skip tour').click();
      await expect(modal).toBeHidden();
    }
  }

  private async openServiceMeshNav(): Promise<void> {
    await this.page.getByRole('button', { name: 'Service Mesh' }).click();
    // The console nav list carries no stable test id; read-only PF class scope.
    await expect(this.page.locator('ul[class*="c-nav__list"]').first()).toBeVisible();
  }

  navLink(pageName: OssmcPageName): Locator {
    return this.page.locator(`a[data-test="nav"][href*="/ossmconsole/${OSSMC_PAGES[pageName]}"]`);
  }

  async navigateTo(pageName: OssmcPageName): Promise<void> {
    await this.navLink(pageName).click();
    // Bounded so /ossmconsole/istio does not also match /ossmconsole/istios.
    await expect(this.page).toHaveURL(new RegExp(`/ossmconsole/${OSSMC_PAGES[pageName]}([/?]|$)`));
    await this.waitForLoad();
  }

  async expectNavLinksDisplayed(): Promise<void> {
    for (const pageName of Object.keys(OSSMC_PAGES) as OssmcPageName[]) {
      // PF6 sets visibility:hidden on collapsed nav <li> parents, so the
      // assertion is presence, not visibility.
      await expect(this.navLink(pageName)).toBeAttached();
    }
  }

  async expectOverviewCards(): Promise<void> {
    await expect(this.getBySel('clusters-card')).toBeVisible();
    await expect(this.getBySel('control-planes-card')).toBeVisible();
    await expect(this.getBySel('data-planes-card')).toBeVisible();
  }

  async expectTrafficGraph(namespace: string): Promise<void> {
    await expect(this.page.locator('#pft-graph')).toBeVisible();
    await expect(this.page.locator(`div#summary-panel-graph div#ns-${namespace}`)).toBeVisible();
  }

  async expectListHasRows(): Promise<void> {
    await expect(this.page.locator('table').first()).toBeVisible();
    await expect(this.page.locator('table tbody tr').first()).toBeVisible();
  }

  async expectIstioConfigControls(): Promise<void> {
    await expect(this.getBySel('istio-actions-toggle')).toBeVisible();
    await expect(this.getBySel('refresh-button')).toBeVisible();
  }
}
