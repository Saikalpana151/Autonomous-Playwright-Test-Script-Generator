// File System Service for managing test files, repositories, and artifacts
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';
import { ApplicationMap } from '../types';

export class FileSystemService {
  private appMapDir: string = 'repositories/application-maps';
  private testDir: string = 'repositories/tests';
  private artifactDir: string = 'test-artifacts';
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [this.appMapDir, this.testDir, path.join(this.testDir, 'page-objects'), this.artifactDir];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.debug(`Created directory: ${dir}`);
      }
    });
  }

  clearRunArtifacts(): void {
    const generatedTest = this.getGeneratedTestsFile();
    fs.writeFileSync(generatedTest, '');

    if (fs.existsSync(this.artifactDir)) {
      for (const entry of fs.readdirSync(this.artifactDir)) {
        fs.rmSync(path.join(this.artifactDir, entry), { force: true, recursive: true });
      }
    }
    this.logger.info('Cleared generated artifacts for the new workflow run');
  }

  clearGeneratedPageObjects(): void {
    const directory = path.join(this.testDir, 'page-objects');
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory)) {
      fs.rmSync(path.join(directory, entry), { force: true });
    }
  }

  getPageObjectNames(): string[] {
    const dir = path.join(this.testDir, 'page-objects');
    return fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((file) => file.endsWith('.ts')).sort()
      : [];
  }

  // Application Map methods
  saveApplicationMap(appMap: ApplicationMap): void {
    try {
      const filePath = path.join(this.appMapDir, `${appMap.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(appMap, null, 2));
      this.logger.info('Application map saved', { appMapName: appMap.name, path: filePath });
    } catch (error) {
      this.logger.error('Error saving application map', error);
      throw error;
    }
  }

  loadApplicationMap(mapName: string): ApplicationMap | null {
    try {
      const filePath = path.join(this.appMapDir, `${mapName}.json`);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        this.logger.debug('Application map loaded', { mapName });
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      this.logger.error('Error loading application map', error);
      return null;
    }
  }

  getAllApplicationMaps(): string[] {
    try {
      if (!fs.existsSync(this.appMapDir)) {
        return [];
      }
      const files = fs.readdirSync(this.appMapDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch (error) {
      this.logger.error('Error retrieving application maps', error);
      return [];
    }
  }

  // Test file methods
  getGeneratedTestsFile(): string {
    return path.join(this.testDir, 'generated-scenarios.spec.ts');
  }

  clearGeneratedTestFile(): void {
    try {
      const filePath = this.getGeneratedTestsFile();
      const headerImport = 'import { test, expect } from \'@playwright/test\';';
      fs.writeFileSync(filePath, headerImport + '\n\n');
      this.logger.debug('Generated test file cleared');
    } catch (error) {
      this.logger.error('Error clearing test file', error);
    }
  }

  appendTestCode(testCode: string): void {
    try {
      const filePath = this.getGeneratedTestsFile();
      const sanitizedCode = this.sanitizeGeneratedTestCode(testCode);

      if (!sanitizedCode.trim()) {
        return;
      }

      fs.writeFileSync(filePath, this.normalizeGeneratedSpec(sanitizedCode));
      this.logger.info('Test code written to generated tests file');
    } catch (error) {
      this.logger.error('Error writing test code', error);
      throw error;
    }
  }

  normalizeGeneratedSpec(content: string): string {
    const withoutImports = this.sanitizeGeneratedTestCode(content)
      .replace(/import\s+\{[^}]*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*Page\s*,\s*Locator\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*Locator\s*,\s*Page\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*Locator\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .trim();

    const normalized = withoutImports
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim();

    const requiresPageType = /\bPage\b/.test(normalized);
    const importLine = requiresPageType
      ? "import { test, expect, type Page } from '@playwright/test';"
      : "import { test, expect } from '@playwright/test';";

    return `${importLine}\n\n${normalized}\n`;
  }

  sanitizeGeneratedTestCode(content: string): string {
    return content
      .replace(/```(?:typescript)?/gi, '')
      .replace(/```/g, '')
      .replace(/import\s+\{\s*Page\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*Page\s*,\s*Locator\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*Locator\s*,\s*Page\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*Locator\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*test\s*,\s*expect\s*,\s*Page\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*test\s*,\s*expect\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*test\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*expect\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/import\s+\{\s*expect\s*,\s*test\s*\}\s+from\s+['"]@playwright\/test['"];?\s*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  getTestCode(testName: string): string | null {
    try {
      const filePath = this.getGeneratedTestsFile();
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const regex = new RegExp(`test\\("${testName}".*?\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}\\)`, 's');
      const match = content.match(regex);

      return match ? match[0] : null;
    } catch (error) {
      this.logger.error('Error retrieving test code', error);
      return null;
    }
  }

  // Page Object Model methods
  savePageObject(pageName: string, pageCode: string): void {
    try {
      const dir = 'repositories/tests/page-objects';
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, `${pageName}.ts`);
      fs.writeFileSync(filePath, pageCode);
      this.logger.info('Page object saved', { pageName, path: filePath });
    } catch (error) {
      this.logger.error('Error saving page object', error);
      throw error;
    }
  }

  loadPageObject(pageName: string): string | null {
    try {
      const filePath = path.join('repositories/tests/page-objects', `${pageName}.ts`);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
      return null;
    } catch (error) {
      this.logger.error('Error loading page object', error);
      return null;
    }
  }

  // Artifact methods
  saveArtifact(artifactName: string, content: string | Buffer): void {
    try {
      const filePath = path.join(this.artifactDir, artifactName);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (typeof content === 'string') {
        fs.writeFileSync(filePath, content);
      } else {
        fs.writeFileSync(filePath, content);
      }

      this.logger.debug('Artifact saved', { artifactName, path: filePath });
    } catch (error) {
      this.logger.error('Error saving artifact', error);
      throw error;
    }
  }

  getArtifactPath(artifactName: string): string {
    return path.join(this.artifactDir, artifactName);
  }

  getAllArtifacts(): string[] {
    try {
      if (!fs.existsSync(this.artifactDir)) {
        return [];
      }
      return fs.readdirSync(this.artifactDir, { recursive: true }) as string[];
    } catch (error) {
      this.logger.error('Error retrieving artifacts', error);
      return [];
    }
  }

  // JSON file methods
  saveJson(filename: string, data: any): void {
    try {
      const filePath = path.join(this.artifactDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug('JSON file saved', { filename, path: filePath });
    } catch (error) {
      this.logger.error('Error saving JSON file', error);
      throw error;
    }
  }

  loadJson(filename: string): any {
    try {
      const filePath = path.join(this.artifactDir, filename);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      return null;
    } catch (error) {
      this.logger.error('Error loading JSON file', error);
      return null;
    }
  }
}
