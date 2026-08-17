// Configuration service for managing environment variables
import * as dotenv from 'dotenv';
import * as fs from 'fs';

export interface Config {
  googleApiKey: string;
  geminiModel: string;
  playwrightMcpUrl: string;
  appUrl: string;
  defaultUsername: string;
  defaultPassword: string;
  logLevel: string;
  logDir: string;
  intentionalFailure: boolean;
}

export class ConfigService {
  private config: Config;

  constructor() {
    // Load .env file
    dotenv.config();

    this.config = {
      googleApiKey: process.env.GOOGLE_API_KEY || '',
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      playwrightMcpUrl: process.env.PLAYWRIGHT_MCP_URL || 'http://localhost:8080',
      appUrl: process.env.APP_URL || 'https://www.saucedemo.com',
      defaultUsername: process.env.DEFAULT_USERNAME || 'standard_user',
      defaultPassword: process.env.DEFAULT_PASSWORD || 'secret_sauce',
      logLevel: process.env.LOG_LEVEL || 'info',
      logDir: process.env.LOG_DIR || 'logs',
      intentionalFailure:
        (process.env.INTENTIONAL_TEST_FAILURE || 'false').toLowerCase() === 'true',
    };
  }

  validate(): boolean {
    if (!this.config.googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not configured in .env file');
    }
    if (!this.config.geminiModel) {
      throw new Error('GEMINI_MODEL is not configured in .env file');
    }
    return true;
  }

  getConfig(): Config {
    return this.config;
  }

  get(key: keyof Config): string {
    return String(this.config[key]);
  }

  isIntentionalFailureEnabled(): boolean {
    return this.config.intentionalFailure;
  }

  ensureDirectories(): void {
    const dirs = [this.config.logDir, 'test-artifacts', 'repositories'];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
}
