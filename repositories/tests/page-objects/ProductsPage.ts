import { Page, expect } from '@playwright/test';

export class ProductsPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async verifyProductsPageLoaded() {
    const productList = this.page.locator('.product_list');
    await expect(productList).toBeVisible();
  }

  async getProductCount(): Promise<number> {
    const products = this.page.locator('.inventory_item');
    return await products.count();
  }

  async addProductToCart(productIndex: number = 0) {
    const addButtons = this.page.locator('.btn_primary');
    await addButtons.nth(productIndex).click();
  }

  async getCartBadgeCount(): Promise<number> {
    const badge = this.page.locator('.shopping_cart_badge');
    const text = await badge.textContent();
    return parseInt(text || '0');
  }

  async openCart() {
    await this.page.click('.shopping_cart_link');
  }

  async verifyProductVisible(productName: string) {
    const product = this.page.locator(`.inventory_item:has-text("${productName}")`);
    await expect(product).toBeVisible();
  }
}
