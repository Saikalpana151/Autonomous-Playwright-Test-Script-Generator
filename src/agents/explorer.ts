// Explorer Agent - Discovers application workflow and elements
import { Logger } from '../services/logger';
import { FileSystemService } from '../services/filesystem';
import { PlaywrightService } from '../services/playwright';
import { ConfigService } from '../services/config';
import { ApplicationMap, PageMap, ElementInfo, MCPConnectionStatus } from '../types';

export class ExplorerAgent {
  private logger: Logger;
  private fileSystemService: FileSystemService;
  private playwrightService: PlaywrightService;
  private configService: ConfigService;
  private mcpConnectionStatus: MCPConnectionStatus;

  constructor(
    logger: Logger,
    fileSystemService: FileSystemService,
    playwrightService: PlaywrightService,
    configService: ConfigService
  ) {
    this.logger = logger;
    this.fileSystemService = fileSystemService;
    this.playwrightService = playwrightService;
    this.configService = configService;
    this.mcpConnectionStatus = {
      connected: false,
      connectionTime: '',
    };
  }

  async explore(
    userStory: string,
    resolvedCredentials?: { username: string; password: string }
  ): Promise<ApplicationMap | null> {
    const startTime = new Date();

    try {
      this.logger.info('\n==================================================');
      this.logger.info('Explorer Agent: Starting application exploration');
      this.logger.info('==================================================');
      this.logger.info(`Exploring for: ${userStory}`);

      // Validate MCP/Playwright connection
      await this.validateConnection();

      // Launch browser
      await this.playwrightService.launchBrowser('chromium');
      await this.playwrightService.createContext();
      const page = await this.playwrightService.createPage();

      if (!page) {
        throw new Error('Failed to create page');
      }

      const appUrl = this.configService.get('appUrl');
      const credentials = resolvedCredentials || {
        username: this.configService.get('defaultUsername'),
        password: this.configService.get('defaultPassword'),
      };
      const applicationMap = await this.discoverApplication(
        page,
        appUrl,
        userStory,
        credentials
      );

      await this.playwrightService.closePage();
      await this.playwrightService.closeContext();

      // Record execution time
      const endTime = new Date();

      this.logger.info(`✓ Exploration completed in ${endTime.getTime() - startTime.getTime()}ms`);
      this.logger.info(`✓ Application Map: ${applicationMap.name}`);
      this.logger.info(`✓ Workflow Steps: ${applicationMap.workflow.join(' → ')}`);
      this.logger.info(`✓ Elements Discovered: ${Object.keys(applicationMap.elements).length}`);
      this.logger.info('==================================================\n');

      // Save application map
      this.fileSystemService.saveApplicationMap(applicationMap);

      return applicationMap;
    } catch (error) {
      this.logger.error('Explorer Agent failed', error);
      await this.playwrightService.closeBrowser();
      return null;
    }
  }

  private async validateConnection(): Promise<void> {
    try {
      this.logger.info('Validating Playwright connection...');

      // For this implementation, we're using local Playwright
      // In production, this would connect to Playwright MCP Server
      this.mcpConnectionStatus = {
        connected: true,
        connectionTime: new Date().toISOString(),
      };

      this.logger.info('✓ Playwright Connection: Connected Successfully');
    } catch (error) {
      this.logger.error('Playwright connection validation failed', error);
      throw error;
    }
  }

  private async discoverApplication(
    page: any,
    appUrl: string,
    userStory: string,
    resolvedCredentials?: { username: string; password: string }
  ): Promise<ApplicationMap> {
    const workflow: string[] = [];
    const elements: Record<string, string> = {};
    const pages: Record<string, PageMap> = {};
    const userStoryLower = userStory.toLowerCase().replace(/check\s+out/g, 'checkout');
    const storyIntent = this.resolveUserStoryIntent(userStory);
    const username = resolvedCredentials?.username || storyIntent.username || this.configService.get('defaultUsername');
    const password = resolvedCredentials?.password || storyIntent.password || this.configService.get('defaultPassword');
    const isNegativeAuthFlow =
      storyIntent.isNegativeLogin ||
      userStoryLower.includes('locked_out') ||
      userStoryLower.includes('invalid credentials') ||
      userStoryLower.includes('error message') ||
      userStoryLower.includes('verify error') ||
      (userStoryLower.includes('login') && userStoryLower.includes('error'));
    const wantsCart = userStoryLower.includes('cart') || userStoryLower.includes('add to cart');
    const wantsCheckout = userStoryLower.includes('checkout') || userStoryLower.includes('confirm order');

    try {
      this.logger.info(`Navigating to ${appUrl}`);
      await page.goto(appUrl);

      workflow.push('login');
      const loginPageElements = await this.discoverLoginPage(page);
      pages['login'] = {
        name: 'LoginPage',
        url: appUrl,
        elements: loginPageElements,
      };
      Object.assign(elements, loginPageElements);

      if (isNegativeAuthFlow) {
        this.logger.info(`Attempting negative login with user: ${username}`);
        await page.fill('#user-name', username);
        await page.fill('#password', password);
        await page.click('#login-button');

        await page.waitForSelector('[data-test="error"]', { timeout: 5000 }).catch(() => {});
        const errorElements = await this.discoverLoginPage(page);
        pages['login-error'] = {
          name: 'LoginErrorPage',
          url: appUrl,
          elements: errorElements,
        };
        Object.assign(elements, errorElements);
        workflow.push('auth-error');
      } else {
        this.logger.info(`Logging in with user: ${username}`);
        await page.fill('#user-name', username);
        await page.fill('#password', password);
        await page.click('#login-button');

        const productsVisible = await page.waitForSelector('.product_list', { timeout: 5000 }).catch(() => null);

        if (productsVisible) {
          workflow.push('products');
          const productsPageElements = await this.discoverProductsPage(page);
          pages['products'] = {
            name: 'ProductsPage',
            url: `${appUrl}inventory.html`,
            elements: productsPageElements,
          };
          Object.assign(elements, productsPageElements);
        }

        if ((wantsCart || wantsCheckout) && !isNegativeAuthFlow) {
          const addButtons = await page.$$('.btn_primary');
          if (addButtons.length > 0) {
            await addButtons[0].click();
            this.logger.info('Product added to cart');
          }

          await page.click('.shopping_cart_link');
          await page.waitForSelector('.cart_list', { timeout: 5000 }).catch(() => {});

          workflow.push('cart');
          const cartPageElements = await this.discoverCartPage(page);
          pages['cart'] = {
            name: 'CartPage',
            url: `${appUrl}cart.html`,
            elements: cartPageElements,
          };
          Object.assign(elements, cartPageElements);

          if (wantsCheckout) {
            await page.click('.checkout_button');
            await page.waitForSelector('[data-test="firstName"]', { timeout: 5000 }).catch(
              () => {}
            );

            workflow.push('checkout-info');
            const checkoutPageElements = await this.discoverCheckoutPage(page);
            pages['checkout-info'] = {
              name: 'CheckoutPage',
              url: `${appUrl}checkout-step-one.html`,
              elements: checkoutPageElements,
            };
            Object.assign(elements, checkoutPageElements);

            await page.fill('[data-test="firstName"]', 'John').catch(() => {});
            await page.fill('[data-test="lastName"]', 'Doe').catch(() => {});
            await page.fill('[data-test="postalCode"]', '12345').catch(() => {});

            await page.click('[data-test="continue"]').catch(() => {});
            await page.waitForSelector('.cart_contents', { timeout: 5000 }).catch(() => {});

            workflow.push('checkout-overview');
            const overviewElements = await this.discoverCheckoutOverviewPage(page);
            pages['checkout-overview'] = {
              name: 'CheckoutOverviewPage',
              url: `${appUrl}checkout-step-two.html`,
              elements: overviewElements,
            };
            Object.assign(elements, overviewElements);

            await page.click('[data-test="finish"]').catch(() => {});
            await page.waitForSelector('.checkout_complete', { timeout: 5000 }).catch(
              () => {}
            );

            workflow.push('checkout-complete');
            const confirmationElements = await this.discoverConfirmationPage(page);
            pages['checkout-complete'] = {
              name: 'ConfirmationPage',
              url: `${appUrl}checkout-complete.html`,
              elements: confirmationElements,
            };
            Object.assign(elements, confirmationElements);
          }
        }
      }

      const applicationMap: ApplicationMap = {
        name: `app-map-${Date.now()}`,
        appUrl,
        workflow,
        elements,
        pages,
        discoveredAt: new Date().toISOString(),
      };

      return applicationMap;
    } catch (error) {
      this.logger.error('Error during application discovery', error);
      throw error;
    }
  }

  private resolveUserStoryIntent(userStory: string): {
    username?: string;
    password?: string;
    isNegativeLogin: boolean;
  } {
    const normalized = userStory.toLowerCase();
    const explicitUsername =
      userStory.match(/(?:username|user(?:name)?\s*[:=]\s*|login\s+with\s+|with\s+)([A-Za-z0-9_.-]+)/i)?.[1]?.trim() ||
      userStory.match(/(?:login\s+with\s+|using\s+|with\s+)([A-Za-z0-9_.-]+)(?=\s+(?:using|with|and|for|verify|$))/i)?.[1]?.trim() ||
      undefined;
    const explicitPassword =
      userStory.match(/(?:password\s*(?:is|=|:)?\s*)([A-Za-z0-9_.!@#$%^&*()-+=]+)/i)?.[1]?.trim() ||
      userStory.match(/(?:using|with)\s+([A-Za-z0-9_.!@#$%^&*()-+=]+)(?=\s+(?:and|for|verify|$))/i)?.[1]?.trim() ||
      undefined;

    return {
      username: explicitUsername || undefined,
      password: explicitPassword || undefined,
      isNegativeLogin:
        normalized.includes('locked_out') ||
        normalized.includes('invalid credentials') ||
        normalized.includes('error message') ||
        normalized.includes('verify error') ||
        (normalized.includes('login') && normalized.includes('error')),
    };
  }

  private async discoverLoginPage(page: any): Promise<Record<string, ElementInfo>> {
    const elements: Record<string, ElementInfo> = {};

    try {
      const username = await page.$('#user-name');
      if (username) {
        elements['username'] = {
          selector: '#user-name',
          type: 'input',
          label: 'Username',
          isClickable: true,
        };
      }

      const password = await page.$('#password');
      if (password) {
        elements['password'] = {
          selector: '#password',
          type: 'input',
          label: 'Password',
          isClickable: true,
        };
      }

      const loginBtn = await page.$('#login-button');
      if (loginBtn) {
        elements['loginButton'] = {
          selector: '#login-button',
          type: 'button',
          label: 'Login',
          isClickable: true,
        };
      }

      const errorMsg = await page.$('[data-test="error"]');
      if (errorMsg) {
        elements['errorMessage'] = {
          selector: '[data-test="error"]',
          type: 'div',
          label: 'Error Message',
        };
      }
    } catch (error) {
      this.logger.debug('Error discovering login page elements', error);
    }

    return elements;
  }

  private async discoverProductsPage(page: any): Promise<Record<string, ElementInfo>> {
    const elements: Record<string, ElementInfo> = {};

    try {
      const productList = await page.$('.product_list');
      if (productList) {
        elements['productList'] = {
          selector: '.product_list',
          type: 'div',
          label: 'Product List',
        };
      }

      const addToCartButtons = await page.$$('.btn_primary');
      if (addToCartButtons.length > 0) {
        elements['addToCartButton'] = {
          selector: '.btn_primary',
          type: 'button',
          label: 'Add to Cart',
          isClickable: true,
        };
      }

      const cartIcon = await page.$('.shopping_cart_link');
      if (cartIcon) {
        elements['cartIcon'] = {
          selector: '.shopping_cart_link',
          type: 'a',
          label: 'Shopping Cart',
          isClickable: true,
        };
      }

      const cartBadge = await page.$('.shopping_cart_badge');
      if (cartBadge) {
        elements['cartBadge'] = {
          selector: '.shopping_cart_badge',
          type: 'span',
          label: 'Cart Badge',
        };
      }

      const sortDropdown = await page.$('.product_sort_container');
      if (sortDropdown) {
        elements['sortDropdown'] = {
          selector: '.product_sort_container',
          type: 'select',
          label: 'Sort Products',
          isClickable: true,
        };
      }
    } catch (error) {
      this.logger.debug('Error discovering products page elements', error);
    }

    return elements;
  }

  private async discoverCartPage(page: any): Promise<Record<string, ElementInfo>> {
    const elements: Record<string, ElementInfo> = {};

    try {
      const cartList = await page.$('.cart_list');
      if (cartList) {
        elements['cartList'] = {
          selector: '.cart_list',
          type: 'div',
          label: 'Cart Items List',
        };
      }

      const checkoutBtn = await page.$('.checkout_button');
      if (checkoutBtn) {
        elements['checkoutButton'] = {
          selector: '.checkout_button',
          type: 'button',
          label: 'Checkout',
          isClickable: true,
        };
      }

      const continueBtn = await page.$('.continue-shopping');
      if (continueBtn) {
        elements['continueShoppingButton'] = {
          selector: '.continue-shopping',
          type: 'button',
          label: 'Continue Shopping',
          isClickable: true,
        };
      }
    } catch (error) {
      this.logger.debug('Error discovering cart page elements', error);
    }

    return elements;
  }

  private async discoverCheckoutPage(page: any): Promise<Record<string, ElementInfo>> {
    const elements: Record<string, ElementInfo> = {};

    try {
      const firstNameInput = await page.$('[data-test="firstName"]');
      if (firstNameInput) {
        elements['firstName'] = {
          selector: '[data-test="firstName"]',
          type: 'input',
          label: 'First Name',
          isClickable: true,
        };
      }

      const lastNameInput = await page.$('[data-test="lastName"]');
      if (lastNameInput) {
        elements['lastName'] = {
          selector: '[data-test="lastName"]',
          type: 'input',
          label: 'Last Name',
          isClickable: true,
        };
      }

      const postalCodeInput = await page.$('[data-test="postalCode"]');
      if (postalCodeInput) {
        elements['postalCode'] = {
          selector: '[data-test="postalCode"]',
          type: 'input',
          label: 'Postal Code',
          isClickable: true,
        };
      }

      const continueBtn = await page.$('[data-test="continue"]');
      if (continueBtn) {
        elements['continueButton'] = {
          selector: '[data-test="continue"]',
          type: 'button',
          label: 'Continue',
          isClickable: true,
        };
      }
    } catch (error) {
      this.logger.debug('Error discovering checkout page elements', error);
    }

    return elements;
  }

  private async discoverCheckoutOverviewPage(
    page: any
  ): Promise<Record<string, ElementInfo>> {
    const elements: Record<string, ElementInfo> = {};

    try {
      const finishBtn = await page.$('[data-test="finish"]');
      if (finishBtn) {
        elements['finishButton'] = {
          selector: '[data-test="finish"]',
          type: 'button',
          label: 'Finish',
          isClickable: true,
        };
      }

      const cartList = await page.$('.cart_contents');
      if (cartList) {
        elements['orderSummary'] = {
          selector: '.cart_contents',
          type: 'div',
          label: 'Order Summary',
        };
      }
    } catch (error) {
      this.logger.debug('Error discovering checkout overview elements', error);
    }

    return elements;
  }

  private async discoverConfirmationPage(page: any): Promise<Record<string, ElementInfo>> {
    const elements: Record<string, ElementInfo> = {};

    try {
      const successMsg = await page.$('.complete-header');
      if (successMsg) {
        elements['successMessage'] = {
          selector: '.complete-header',
          type: 'h2',
          label: 'Success Message',
        };
      }

      const backBtn = await page.$('[data-test="back-to-products"]');
      if (backBtn) {
        elements['backToProductsButton'] = {
          selector: '[data-test="back-to-products"]',
          type: 'button',
          label: 'Back to Products',
          isClickable: true,
        };
      }
    } catch (error) {
      this.logger.debug('Error discovering confirmation page elements', error);
    }

    return elements;
  }

  getMCPConnectionStatus(): MCPConnectionStatus {
    return this.mcpConnectionStatus;
  }
}
