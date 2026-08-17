import { Page, expect } from '@playwright/test';

export class LoginPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigate() {
    await this.page.goto('https://www.saucedemo.com');
  }

  async login(username: string, password: string) {
    await this.page.fill('#user-name', username);
    await this.page.fill('#password', password);
    await this.page.click('#login-button');
  }

  async verifyLoginPage() {
    const userNameField = this.page.locator('#user-name');
    await expect(userNameField).toBeVisible();
  }

  async verifyErrorMessage(expectedMessage: string) {
    const errorMessage = this.page.locator('[data-test="error"]');
    await expect(errorMessage).toContainText(expectedMessage);
  }

  async getErrorMessage(): Promise<string> {
    return await this.page.locator('[data-test="error"]').textContent() || '';
  }
}
