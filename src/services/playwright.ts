// Playwright Service for browser automation
import {
  Browser,
  BrowserContext,
  Page,
  chromium,
  firefox,
  webkit,
} from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export type BrowserType = 'chromium' | 'firefox' | 'webkit' | 'edge';

export class PlaywrightService {
  private logger: Logger;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private artifactDir: string = 'test-artifacts';

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async launchBrowser(browserType: BrowserType = 'chromium'): Promise<Browser> {
    try {
      this.logger.info('Launching browser', { browserType });

      switch (browserType) {
        case 'firefox':
          this.browser = await firefox.launch({ headless: false });
          break;
        case 'webkit':
          this.browser = await webkit.launch({ headless: false });
          break;
        case 'edge':
          // Edge is Chromium-based
          this.browser = await chromium.launch({
            channel: 'msedge',
            headless: false,
          });
          break;
        case 'chromium':
        default:
          this.browser = await chromium.launch({ headless: false });
          break;
      }

      this.logger.info('Browser launched successfully', { browserType });
      return this.browser;
    } catch (error) {
      this.logger.error('Failed to launch browser', error);
      throw error;
    }
  }

  async createContext(
    recordVideo: boolean = true,
    recordTrace: boolean = true
  ): Promise<BrowserContext> {
    try {
      if (!this.browser) {
        throw new Error('Browser is not launched');
      }

      const contextOptions: any = {
        recordVideo: recordVideo ? { dir: path.join(this.artifactDir, 'videos') } : undefined,
      };

      this.context = await this.browser.newContext(contextOptions);

      if (recordTrace) {
        await this.context.tracing.start({ screenshots: true, snapshots: true });
      }

      this.logger.info('Browser context created');
      return this.context;
    } catch (error) {
      this.logger.error('Failed to create context', error);
      throw error;
    }
  }

  async createPage(): Promise<Page> {
    try {
      if (!this.context) {
        throw new Error('Browser context is not created');
      }

      this.page = await this.context.newPage();
      this.logger.info('New page created');
      return this.page;
    } catch (error) {
      this.logger.error('Failed to create page', error);
      throw error;
    }
  }

  async navigate(url: string): Promise<void> {
    try {
      if (!this.page) {
        throw new Error('Page is not created');
      }

      this.logger.info('Navigating to URL', { url });
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      this.logger.info('Navigation completed');
    } catch (error) {
      this.logger.error('Failed to navigate', error);
      throw error;
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  async takeScreenshot(name: string): Promise<string> {
    try {
      if (!this.page) {
        throw new Error('Page is not created');
      }

      const screenshotDir = path.join(this.artifactDir, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const filePath = path.join(screenshotDir, `${name}-${Date.now()}.png`);
      await this.page.screenshot({ path: filePath });

      this.logger.debug('Screenshot captured', { name, path: filePath });
      return filePath;
    } catch (error) {
      this.logger.error('Failed to take screenshot', error);
      return '';
    }
  }

  async saveTrace(name: string): Promise<string> {
    try {
      if (!this.context) {
        throw new Error('Context is not created');
      }

      const traceDir = path.join(this.artifactDir, 'traces');
      if (!fs.existsSync(traceDir)) {
        fs.mkdirSync(traceDir, { recursive: true });
      }

      const filePath = path.join(traceDir, `${name}-${Date.now()}.zip`);
      await this.context.tracing.stop({ path: filePath });

      this.logger.debug('Trace saved', { name, path: filePath });
      return filePath;
    } catch (error) {
      this.logger.error('Failed to save trace', error);
      return '';
    }
  }

  async closePage(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
        this.logger.info('Page closed');
      }
    } catch (error) {
      this.logger.error('Error closing page', error);
    }
  }

  async closeContext(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
        this.logger.info('Context closed');
      }
    } catch (error) {
      this.logger.error('Error closing context', error);
    }
  }

  async closeBrowser(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.logger.info('Browser closed');
      }
    } catch (error) {
      this.logger.error('Error closing browser', error);
    }
  }
}
