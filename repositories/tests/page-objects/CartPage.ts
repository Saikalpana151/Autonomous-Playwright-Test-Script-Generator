import { Page, expect } from '@playwright/test';

export class CartPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async verifyCartPageLoaded() {
    const cartList = this.page.locator('.cart_list');
    await expect(cartList).toBeVisible();
  }

  async getCartItemCount(): Promise<number> {
    const items = this.page.locator('.cart_item');
    return await items.count();
  }

  async verifyItemInCart(productName: string) {
    const item = this.page.locator(`.cart_item:has-text("${productName}")`);
    await expect(item).toBeVisible();
  }

  async proceedToCheckout() {
    await this.page.click('.checkout_button');
  }

  async continueShopping() {
    await this.page.click('.continue-shopping');
  }

  async removeItem(productIndex: number = 0) {
    const removeButtons = this.page.locator('.btn_secondary');
    await removeButtons.nth(productIndex).click();
  }
}
