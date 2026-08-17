// Executor Agent - Executes the generated tests
import { Logger } from '../services/logger';
import { PlaywrightService } from '../services/playwright';
import { ConfigService } from '../services/config';
import { ExecutionResults, StepResult } from '../types';

export class ExecutorAgent {
  private logger: Logger;
  private playwrightService: PlaywrightService;
  private configService: ConfigService;

  constructor(
    logger: Logger,
    playwrightService: PlaywrightService,
    configService: ConfigService
  ) {
    this.logger = logger;
    this.playwrightService = playwrightService;
    this.configService = configService;
  }

  async execute(
    scenario: string,
    browser: 'chromium' | 'firefox' | 'webkit' | 'edge' = 'chromium'
  ): Promise<ExecutionResults | null> {
    const startTime = new Date();

    try {
      this.logger.info('\n==================================================');
      this.logger.info('Executor Agent: Executing test scenario');
      this.logger.info('==================================================');
      this.logger.info(`Scenario: ${scenario}`);
      this.logger.info(`Browser: ${browser}`);

      // Create execution results object
      const results: ExecutionResults = {
        scenario,
        passed: false,
        duration: 0,
        startTime: startTime.toISOString(),
        endTime: '',
        browser,
        steps: [],
        screenshots: [],
        traces: [],
        videos: [],
        logs: [],
        retryInfo: {
          attempts: 1,
          failures: [],
        },
      };

      // Launch browser and context
      await this.playwrightService.launchBrowser(browser);
      await this.playwrightService.createContext();
      const page = await this.playwrightService.createPage();

      if (!page) {
        throw new Error('Failed to create page');
      }

      // Navigate to app
      const appUrl = this.configService.get('appUrl');
      await this.playwrightService.navigate(appUrl);

      // Execute test based on scenario
      const executionSuccess = await this.executeScenario(scenario, page, results);

      if (executionSuccess) {
        results.passed = true;
        this.logger.info('✓ Test execution passed');
      } else {
        results.passed = false;
        this.logger.warn('✗ Test execution failed');
      }

      // Take final screenshot
      const screenshotPath = await this.playwrightService.takeScreenshot(
        `${scenario}-final`
      );
      if (screenshotPath) {
        results.screenshots.push(screenshotPath);
      }

      // Save trace
      const tracePath = await this.playwrightService.saveTrace(scenario);
      if (tracePath) {
        results.traces.push(tracePath);
      }

      // Clean up
      await this.playwrightService.closePage();
      await this.playwrightService.closeContext();
      await this.playwrightService.closeBrowser();

      // Calculate duration
      const endTime = new Date();
      results.endTime = endTime.toISOString();
      results.duration = endTime.getTime() - startTime.getTime();

      this.logger.info(`✓ Execution completed in ${results.duration}ms`);
      this.logger.info(`✓ Status: ${results.passed ? 'PASSED' : 'FAILED'}`);
      this.logger.info(`✓ Screenshots: ${results.screenshots.length}`);
      this.logger.info(`✓ Traces: ${results.traces.length}`);
      this.logger.info('==================================================\n');

      return results;
    } catch (error) {
      this.logger.error('Executor Agent failed', error);
      await this.playwrightService.closeBrowser();

      const endTime = new Date();
      return {
        scenario,
        passed: false,
        duration: endTime.getTime() - startTime.getTime(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        browser,
        steps: [],
        screenshots: [],
        traces: [],
        videos: [],
        logs: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        retryInfo: {
          attempts: 1,
          failures: [],
        },
      };
    }
  }

  private async executeScenario(
    scenario: string,
    page: any,
    results: ExecutionResults
  ): Promise<boolean> {
    let stepCount = 0;
    const username = this.configService.get('defaultUsername');
    const password = this.configService.get('defaultPassword');

    try {
      const scenarioLower = scenario.toLowerCase();

      // Login scenario or initial login for other scenarios
      if (!scenarioLower.includes('locked_out')) {
        stepCount++;
        const loginStep = await this.executeLoginStep(page, username, password);
        results.steps.push(loginStep);

        if (!loginStep.status) {
          throw new Error('Login failed');
        }
      }

      // Execute scenario-specific steps
      if (scenarioLower.includes('login')) {
        // Already logged in
      } else if (scenarioLower.includes('locked_out')) {
        stepCount++;
        const lockedOutStep = await this.executeLockedOutUserStep(page);
        results.steps.push(lockedOutStep);
      } else if (scenarioLower.includes('add') && scenarioLower.includes('cart')) {
        stepCount++;
        const addStep = await this.executeAddToCartStep(page);
        results.steps.push(addStep);

        if (addStep.status) {
          stepCount++;
          const verifyStep = await this.executeVerifyCartBadgeStep(page);
          results.steps.push(verifyStep);
        }
      } else if (scenarioLower.includes('cart') && scenarioLower.includes('content')) {
        stepCount++;
        const addStep1 = await this.executeAddToCartStep(page);
        results.steps.push(addStep1);

        stepCount++;
        const addStep2 = await this.executeAddToCartStep(page, 1);
        results.steps.push(addStep2);

        stepCount++;
        const openCartStep = await this.executeOpenCartStep(page);
        results.steps.push(openCartStep);

        if (openCartStep.status) {
          stepCount++;
          const verifyStep = await this.executeVerifyCartContentsStep(page, 2);
          results.steps.push(verifyStep);
        }
      } else if (scenarioLower.includes('checkout')) {
        stepCount++;
        const addStep = await this.executeAddToCartStep(page);
        results.steps.push(addStep);

        stepCount++;
        const openCartStep = await this.executeOpenCartStep(page);
        results.steps.push(openCartStep);

        stepCount++;
        const checkoutStep = await this.executeCheckoutStep(page);
        results.steps.push(checkoutStep);

        stepCount++;
        const infoStep = await this.executeCheckoutInfoStep(page);
        results.steps.push(infoStep);

        stepCount++;
        const continueStep = await this.executeContinueCheckoutStep(page);
        results.steps.push(continueStep);

        stepCount++;
        const finishStep = await this.executeFinishOrderStep(page);
        results.steps.push(finishStep);

        stepCount++;
        const confirmStep = await this.executeVerifyOrderConfirmationStep(page);
        results.steps.push(confirmStep);
      } else {
        // Default: just verify products are shown
        stepCount++;
        const verifyStep = await this.executeVerifyProductsStep(page);
        results.steps.push(verifyStep);
      }

      // All steps passed
      return results.steps.every((step) => step.status);
    } catch (error) {
      this.logger.error('Error executing scenario', error);
      const errorStep: StepResult = {
        step: stepCount + 1,
        action: 'Unknown',
        status: 'failed',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.steps.push(errorStep);
      return false;
    }
  }

  private async executeLoginStep(
    page: any,
    username: string,
    password: string
  ): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await page.fill('#user-name', username);
      await page.fill('#password', password);
      await page.click('#login-button');
      await page.waitForSelector('.product_list', { timeout: 5000 });

      return {
        step: 1,
        action: 'Login',
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step: 1,
        action: 'Login',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  private async executeLockedOutUserStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const username = 'locked_out_user';
      const password = 'secret_sauce';

      await page.fill('#user-name', username);
      await page.fill('#password', password);
      await page.click('#login-button');

      // Check for error message
      const errorMsg = await page.locator('[data-test="error"]').textContent();

      if (errorMsg && errorMsg.includes('locked out')) {
        return {
          step: 1,
          action: 'Verify Locked Out User Error',
          status: 'passed',
          duration: Date.now() - startTime,
        };
      }

      throw new Error('Expected error message not found');
    } catch (error) {
      return {
        step: 1,
        action: 'Verify Locked Out User Error',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Test failed',
      };
    }
  }

  private async executeAddToCartStep(page: any, index: number = 0): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const buttons = await page.$$('.btn_primary');
      if (buttons.length > index) {
        await buttons[index].click();

        return {
          step: 1,
          action: 'Add Product to Cart',
          status: 'passed',
          duration: Date.now() - startTime,
        };
      }

      throw new Error('No add to cart button found');
    } catch (error) {
      return {
        step: 1,
        action: 'Add Product to Cart',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Failed to add product',
      };
    }
  }

  private async executeVerifyCartBadgeStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const badge = await page.$('.shopping_cart_badge');
      if (badge) {
        const count = await badge.textContent();
        if (parseInt(count || '0') > 0) {
          return {
            step: 2,
            action: 'Verify Cart Badge',
            status: 'passed',
            duration: Date.now() - startTime,
          };
        }
      }

      throw new Error('Cart badge not found or count is 0');
    } catch (error) {
      return {
        step: 2,
        action: 'Verify Cart Badge',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Badge verification failed',
      };
    }
  }

  private async executeOpenCartStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await page.click('.shopping_cart_link');
      await page.waitForSelector('.cart_list', { timeout: 5000 });

      return {
        step: 1,
        action: 'Open Cart',
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step: 1,
        action: 'Open Cart',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Failed to open cart',
      };
    }
  }

  private async executeVerifyCartContentsStep(
    page: any,
    expectedItemCount: number
  ): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const items = await page.$$('.cart_item');
      if (items.length >= expectedItemCount) {
        return {
          step: 1,
          action: 'Verify Cart Contents',
          status: 'passed',
          duration: Date.now() - startTime,
        };
      }

      throw new Error(`Expected ${expectedItemCount} items, found ${items.length}`);
    } catch (error) {
      return {
        step: 1,
        action: 'Verify Cart Contents',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Cart verification failed',
      };
    }
  }

  private async executeCheckoutStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await page.click('.checkout_button');
      await page.waitForSelector('[data-test="firstName"]', { timeout: 5000 });

      return {
        step: 1,
        action: 'Proceed to Checkout',
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step: 1,
        action: 'Proceed to Checkout',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Checkout failed',
      };
    }
  }

  private async executeCheckoutInfoStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await page.fill('[data-test="firstName"]', 'John');
      await page.fill('[data-test="lastName"]', 'Doe');
      await page.fill('[data-test="postalCode"]', '12345');

      return {
        step: 1,
        action: 'Enter Checkout Information',
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step: 1,
        action: 'Enter Checkout Information',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Failed to enter info',
      };
    }
  }

  private async executeContinueCheckoutStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await page.click('[data-test="continue"]');
      await page.waitForSelector('.cart_contents', { timeout: 5000 });

      return {
        step: 1,
        action: 'Continue to Overview',
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step: 1,
        action: 'Continue to Overview',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Continue failed',
      };
    }
  }

  private async executeFinishOrderStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await page.click('[data-test="finish"]');
      await page.waitForSelector('.checkout_complete', { timeout: 5000 });

      return {
        step: 1,
        action: 'Finish Order',
        status: 'passed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step: 1,
        action: 'Finish Order',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Finish failed',
      };
    }
  }

  private async executeVerifyOrderConfirmationStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const confirmationMessage = await page.locator('.complete-header').textContent();

      if (confirmationMessage && confirmationMessage.includes('Thank you')) {
        return {
          step: 1,
          action: 'Verify Order Confirmation',
          status: 'passed',
          duration: Date.now() - startTime,
        };
      }

      throw new Error('Confirmation message not found');
    } catch (error) {
      return {
        step: 1,
        action: 'Verify Order Confirmation',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Confirmation verification failed',
      };
    }
  }

  private async executeVerifyProductsStep(page: any): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const productList = await page.$('.product_list');
      if (productList) {
        const products = await page.$$('.inventory_item');
        if (products.length > 0) {
          return {
            step: 2,
            action: 'Verify Products Displayed',
            status: 'passed',
            duration: Date.now() - startTime,
          };
        }
      }

      throw new Error('No products found');
    } catch (error) {
      return {
        step: 2,
        action: 'Verify Products Displayed',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Product verification failed',
      };
    }
  }
}
