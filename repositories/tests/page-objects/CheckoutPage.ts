import { Page, expect } from '@playwright/test';

export class CheckoutPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async verifyCheckoutPageLoaded() {
    const firstNameField = this.page.locator('[data-test="firstName"]');
    await expect(firstNameField).toBeVisible();
  }

  async fillCheckoutInfo(firstName: string, lastName: string, postalCode: string) {
    await this.page.fill('[data-test="firstName"]', firstName);
    await this.page.fill('[data-test="lastName"]', lastName);
    await this.page.fill('[data-test="postalCode"]', postalCode);
  }

  async continueToOverview() {
    await this.page.click('[data-test="continue"]');
  }

  async verifyCheckoutInfoDisplayed(firstName: string) {
    const firstNameField = this.page.locator('[data-test="firstName"]');
    await expect(firstNameField).toHaveValue(firstName);
  }
}
