import { Page, expect } from '@playwright/test';

export class ConfirmationPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async verifyOrderConfirmation() {
    const successMessage = this.page.locator('.complete-header');
    await expect(successMessage).toBeVisible();
  }

  async verifySuccessMessage(expectedMessage: string) {
    const message = this.page.locator('.complete-header');
    await expect(message).toContainText(expectedMessage);
  }

  async backToProducts() {
    await this.page.click('[data-test="back-to-products"]');
  }

  async getConfirmationText(): Promise<string> {
    return await this.page.locator('.complete-header').textContent() || '';
  }
}
