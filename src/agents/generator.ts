// Generator Agent - Generates Playwright test code
import { Logger } from '../services/logger';
import { FileSystemService } from '../services/filesystem';
import { LLMService } from '../services/llm';
import { ApplicationMap, TestPlan } from '../types';

export class GeneratorAgent {
  private logger: Logger;
  private fileSystemService: FileSystemService;
  private llmService: LLMService;

  constructor(
    logger: Logger,
    fileSystemService: FileSystemService,
    llmService: LLMService
  ) {
    this.logger = logger;
    this.fileSystemService = fileSystemService;
    this.llmService = llmService;
  }

  async generate(
    scenario: string,
    applicationMap: ApplicationMap,
    testPlan: TestPlan | null,
    isReused: boolean,
    userStory?: string
  ): Promise<string | null> {
    try {
      this.logger.info('\n==================================================');
      this.logger.info('Generator Agent: Generating test code');
      this.logger.info('==================================================');
      this.logger.info(`Scenario: ${scenario}`);

      if (isReused) {
        this.logger.info('✓ Attempting to reuse existing test from repository');
        const existingTest = this.fileSystemService.getTestCode(scenario);
        if (existingTest) {
          this.logger.info(`✓ Test code retrieved: ${scenario}`);
          this.logger.info('==================================================\n');
          return existingTest;
        }
        this.logger.warn('⚠ Reused test files not found. Regenerating autonomously from user story...');
      }

      // Always clear the generated spec file to ensure only current test runs
      this.fileSystemService.clearGeneratedTestFile();

      // Generate only the page objects needed by the active scenario
      // Use user story if available for better autonomous regeneration
      const contextForGeneration = userStory || scenario;
      await this.generatePageObjects(testPlan, contextForGeneration);

      // Generate test code
      let testCode = this.generateDefaultTestCode(scenario, applicationMap, testPlan, contextForGeneration);

      // Try to enhance with LLM if test plan is available
      if (testPlan && testPlan.steps && testPlan.steps.length > 0) {
        try {
          const enhancedCode = await this.generateTestCodeWithLLM(
            testPlan,
            applicationMap
          );
          if (enhancedCode) {
            testCode = enhancedCode;
          }
        } catch (error) {
          this.logger.warn('LLM code generation failed, using default template', error);
        }
      }

      if (process.env.INTENTIONAL_TEST_FAILURE === 'true') {
        testCode = this.injectIntentionalFailure(testCode);
      }

      // Append test code to master test file
      this.fileSystemService.appendTestCode(testCode);

      this.logger.info('✓ Test code generated and appended');
      this.logger.info(`✓ Scenario: ${scenario}`);
      this.logger.info('==================================================\n');

      return testCode;
    } catch (error) {
      this.logger.error('Generator Agent failed', error);
      return null;
    }
  }

  private async generatePageObjects(
    testPlan: TestPlan | null,
    scenario: string
  ): Promise<void> {
    try {
      this.logger.info('Generating required Page Objects...');

      const relevantSteps = (testPlan?.steps || []).map((step) => step.action.toLowerCase()).join(' ');
      const scenarioContext = `${scenario} ${relevantSteps}`.toLowerCase();
      const requiresPositiveJourney =
        scenarioContext.includes('product') ||
        scenarioContext.includes('inventory') ||
        scenarioContext.includes('add to cart') ||
        scenarioContext.includes('cart') ||
        scenarioContext.includes('checkout') ||
        scenarioContext.includes('confirm order');
      const requiresNegativeLogin =
        scenarioContext.includes('locked_out') ||
        scenarioContext.includes('error') ||
        scenarioContext.includes('invalid credentials');
      const requiresProducts = requiresPositiveJourney && !requiresNegativeLogin && scenarioContext.includes('product');
      const requiresCart = requiresPositiveJourney && !requiresNegativeLogin && (scenarioContext.includes('cart') || scenarioContext.includes('add to cart'));
      const requiresCheckout = requiresPositiveJourney && !requiresNegativeLogin && (scenarioContext.includes('checkout') || scenarioContext.includes('confirm order'));

      const loginPageCode = this.generateLoginPage();
      this.fileSystemService.savePageObject('LoginPage', loginPageCode);

      if (requiresProducts) {
        const productsPageCode = this.generateProductsPage();
        this.fileSystemService.savePageObject('ProductsPage', productsPageCode);
      }

      if (requiresCart) {
        const cartPageCode = this.generateCartPage();
        this.fileSystemService.savePageObject('CartPage', cartPageCode);
      }

      if (requiresCheckout) {
        const checkoutPageCode = this.generateCheckoutPage();
        this.fileSystemService.savePageObject('CheckoutPage', checkoutPageCode);

        const confirmationPageCode = this.generateConfirmationPage();
        this.fileSystemService.savePageObject('ConfirmationPage', confirmationPageCode);
      }

      this.logger.info('✓ Required Page Objects generated');
    } catch (error) {
      this.logger.error('Error generating page objects', error);
    }
  }

  private generateLoginPage(): string {
    return `import { Page, expect } from '@playwright/test';

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
`;
  }

  private generateProductsPage(): string {
    return `import { Page, expect } from '@playwright/test';

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
    const product = this.page.locator(\`.inventory_item:has-text("\${productName}")\`);
    await expect(product).toBeVisible();
  }
}
`;
  }

  private generateCartPage(): string {
    return `import { Page, expect } from '@playwright/test';

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
    const item = this.page.locator(\`.cart_item:has-text("\${productName}")\`);
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
`;
  }

  private generateCheckoutPage(): string {
    return `import { Page, expect } from '@playwright/test';

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
`;
  }

  private generateConfirmationPage(): string {
    return `import { Page, expect } from '@playwright/test';

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
`;
  }

  private extractUsername(userStory: string): string | undefined {
    const patterns = [
      /(?:login\s+with\s+|with\s+|user(?:name)?\s*(?:=|:)?\s*)"([^"]+)"/i,
      /(?:login\s+with\s+|with\s+|user(?:name)?\s*(?:=|:)?\s*)'([^']+)'/i,
      /(?:login\s+with\s+|with\s+|user(?:name)?\s*(?:=|:)?\s*)([A-Za-z0-9_.-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = userStory.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private extractPassword(userStory: string): string | undefined {
    const patterns = [
      /(?:password\s*(?:is|=|:)?\s*|and\s+|using\s+)"([^"]+)"/i,
      /(?:password\s*(?:is|=|:)?\s*|and\s+|using\s+)'([^']+)'/i,
      /(?:password\s*(?:is|=|:)?\s*|and\s+|using\s+)([A-Za-z0-9_.!@#$%^&*()-+=]+)/i,
    ];

    for (const pattern of patterns) {
      const match = userStory.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private async generateTestCodeWithLLM(
    testPlan: TestPlan,
    applicationMap: ApplicationMap
  ): Promise<string | null> {
    try {
      const testPlanJson = JSON.stringify(testPlan, null, 2);
      const appMapJson = JSON.stringify(applicationMap, null, 2);

      const llmResponse = await this.llmService.generatePlaywrightTest(
        testPlanJson,
        appMapJson
      );

      return llmResponse || null;
    } catch (error) {
      this.logger.debug('Error generating test with LLM', error);
      return null;
    }
  }

  private injectIntentionalFailure(testCode: string): string {
    return testCode
      .replace(/#login-button/g, '#wrong-login-button')
      .replace(/\[data-test="login-button"\]/g, '[data-test="wrong-login-button"]')
      .replace(/\[data-test='login-button'\]/g, "[data-test='wrong-login-button']")
      .replace(/loginButton\.click\(\)/g, "page.locator('#wrong-login-button').click()")
      .replace(/\['login-button'\]/g, "['wrong-login-button']")
      .replace(/\.click\(\);\s*await expect\(page\.locator\('\.inventory_list'\)\)/g, ".click();\n    await expect(page.locator('.inventory_list')).toBeVisible();");
  }

  private generateDefaultTestCode(
    scenario: string,
    _applicationMap: ApplicationMap,
    testPlan: TestPlan | null,
    userStoryContext?: string
  ): string {
    const scenarioName = scenario.replace(/\s+/g, ' ').trim();
    const userStory = (testPlan && testPlan.userStory) || userStoryContext || scenario;
    const userStoryLower = userStory.toLowerCase().replace(/check\s+out/g, 'checkout');
    const isNegativeAuthFlow =
      userStoryLower.includes('locked_out') ||
      userStoryLower.includes('invalid credentials') ||
      userStoryLower.includes('error message') ||
      userStoryLower.includes('verify error') ||
      (userStoryLower.includes('login') && userStoryLower.includes('error'));
    const explicitUsername = this.extractUsername(userStory)
      || process.env.DEFAULT_USERNAME
      || 'standard_user';
    const explicitPassword = this.extractPassword(userStory)
      || process.env.DEFAULT_PASSWORD
      || 'secret_sauce';
    const requiresCheckout = userStoryLower.includes('checkout') || userStoryLower.includes('confirm order');
    const requiresCart = userStoryLower.includes('cart') || userStoryLower.includes('add to cart') || requiresCheckout;

    if (isNegativeAuthFlow) {
      return `
import { test, expect } from '@playwright/test';

test('${scenarioName}', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.fill('#user-name', '${explicitUsername}');
  await page.fill('#password', '${explicitPassword}');
  await page.click('#login-button');

  const errorMessage = page.locator('[data-test="error"]');
  await expect(errorMessage).toBeVisible();
  await expect(errorMessage).toContainText(/locked out|Username and password do not match|error/i);
});
`;
    }

    if (requiresCheckout) {
      return `
import { test, expect } from '@playwright/test';

test('${scenarioName}', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('[data-test="username"]').fill('${explicitUsername}');
  await page.locator('[data-test="password"]').fill('${explicitPassword}');
  await page.locator('[data-test="login-button"]').click();
  await expect(page).toHaveURL(/.*inventory.html/);
  const addBtn = page.locator('[data-test^="add-to-cart"]').first();
  await addBtn.click();
  await page.locator('.shopping_cart_link').click();
  await expect(page).toHaveURL(/.*cart.html/);
  await page.locator('[data-test="checkout"]').click();
  await page.locator('[data-test="firstName"]').fill('Test');
  await page.locator('[data-test="lastName"]').fill('User');
  await page.locator('[data-test="postalCode"]').fill('12345');
  await page.locator('[data-test="continue"]').click();
  await expect(page.locator('.summary_info')).toBeVisible();
  await page.locator('[data-test="finish"]').click();
  await expect(page.locator('.complete-header')).toContainText('Thank you');
});
`;
    }

    if (requiresCart) {
      return `
import { test, expect } from '@playwright/test';

test('${scenarioName}', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('[data-test="username"]').fill('${explicitUsername}');
  await page.locator('[data-test="password"]').fill('${explicitPassword}');
  await page.locator('[data-test="login-button"]').click();
  await expect(page).toHaveURL(/.*inventory.html/);
  const addBtn = page.locator('[data-test^="add-to-cart"]').first();
  await addBtn.click();
  await page.locator('.shopping_cart_link').click();
  await expect(page).toHaveURL(/.*cart.html/);
  await expect(page.locator('.cart_list')).toBeVisible();
});
`;
    }

    return `
import { test, expect } from '@playwright/test';

test('${scenarioName}', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.locator('[data-test="username"]').fill('${explicitUsername}');
  await page.locator('[data-test="password"]').fill('${explicitPassword}');
  await page.locator('[data-test="login-button"]').click();
  await expect(page.locator('.inventory_list')).toBeVisible();
});
`;
  }
}
