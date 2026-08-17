// Healer Agent - Analyzes and fixes failing tests
import * as fs from 'fs';
import { Logger } from '../services/logger';
import { LLMService } from '../services/llm';
import { FileSystemService } from '../services/filesystem';
import { ExecutionResults, ApplicationMap, TestPlan, FailureInfo, FailureType } from '../types';

export class HealerAgent {
  private logger: Logger;
  private fileSystemService: FileSystemService;
  private llmService: LLMService;

  constructor(
    logger: Logger,
    llmService: LLMService,
    fileSystemService: FileSystemService
  ) {
    this.logger = logger;
    this.llmService = llmService;
    this.fileSystemService = fileSystemService;
  }

  async analyze(
    executionResults: ExecutionResults | null,
    _applicationMap: ApplicationMap | null,
    _testPlan: TestPlan | null
  ): Promise<boolean> {
    if (!executionResults || executionResults.passed) {
      return false;
    }

    try {
      this.logger.info('\n==================================================');
      this.logger.info('HEALER ANALYZING FAILURE');
      this.logger.info('==================================================');

      const failureType = this.analyzeFailure(executionResults);
      const failureLog = executionResults.error || executionResults.logs.join('\n') || 'Unknown Playwright failure';
      this.logger.info(`Root Cause: ${failureType}`);

      const llmSummary = await this.llmService.analyzeFailure(
        failureLog,
        JSON.stringify(_testPlan ?? { scenario: executionResults.scenario }, null, 2)
      );

      let healingStrategy = 'Repair the generated Playwright test';
      try {
        const payload = JSON.parse(llmSummary.replace(/```json|```/gi, '').trim());
        if (payload.healingStrategy) {
          healingStrategy = payload.healingStrategy;
        }
      } catch {
        // ignore parse failure and continue with default fix
      }

      const fixed = await this.applyFixToGeneratedTest(failureLog, failureType, healingStrategy);
      if (!fixed) {
        return false;
      }

      const failureInfo: FailureInfo = {
        attempt: executionResults.retryInfo.attempts + 1,
        rootCause: failureType,
        healingStrategy,
        timestamp: new Date().toISOString(),
      };

      executionResults.retryInfo.failures.push(failureInfo);
      this.logger.info(`Healing Strategy: ${healingStrategy}`);
      this.logger.info('HEALER FIX APPLIED');
      this.logger.info('==================================================\n');
      return true;
    } catch (error) {
      this.logger.error('Healer Agent failed', error);
      return false;
    }
  }

  private async applyFixToGeneratedTest(
    failureLog: string,
    _failureType: FailureType,
    _healingStrategy: string
  ): Promise<boolean> {
    const specPath = this.fileSystemService.getGeneratedTestsFile();
    if (!fs.existsSync(specPath)) {
      return false;
    }

    const currentSpec = fs.readFileSync(specPath, 'utf-8');
    const repairedCode = await this.llmService.repairPlaywrightTest(currentSpec, failureLog);

    if (!repairedCode || repairedCode.length < 50) {
      return false;
    }

    const cleanedCode = this.fileSystemService.normalizeGeneratedSpec(repairedCode);
    fs.writeFileSync(specPath, cleanedCode);
    return true;
  }

  private analyzeFailure(executionResults: ExecutionResults): FailureType {
    try {
      const errorMessage = executionResults.error?.toLowerCase() || '';
      const lastStep = executionResults.steps[executionResults.steps.length - 1];
      const lastError = lastStep?.error?.toLowerCase() || '';

      // Check for specific error patterns
      if (
        errorMessage.includes('selector') ||
        errorMessage.includes('locator') ||
        errorMessage.includes('not found') ||
        lastError.includes('selector') ||
        lastError.includes('locator')
      ) {
        return 'LOCATOR_FAILURE';
      }

      if (
        errorMessage.includes('expect') ||
        errorMessage.includes('assertion') ||
        errorMessage.includes('assertion error') ||
        lastError.includes('expect') ||
        lastError.includes('assertion')
      ) {
        return 'ASSERTION_FAILURE';
      }

      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('waitfor') ||
        lastError.includes('timeout') ||
        lastError.includes('waitfor')
      ) {
        return 'TIMEOUT_FAILURE';
      }

      if (
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('econnrefused') ||
        lastError.includes('network') ||
        lastError.includes('connection')
      ) {
        return 'NETWORK_FAILURE';
      }

      if (
        errorMessage.includes('flaky') ||
        errorMessage.includes('intermittent') ||
        lastError.includes('flaky')
      ) {
        return 'FLAKY_FAILURE';
      }

      if (
        errorMessage.includes('business') ||
        errorMessage.includes('logic') ||
        errorMessage.includes('workflow') ||
        lastError.includes('business')
      ) {
        return 'BUSINESS_LOGIC_FAILURE';
      }

      // Default to unknown
      return 'UNKNOWN_FAILURE';
    } catch (error) {
      this.logger.debug('Error analyzing failure', error);
      return 'UNKNOWN_FAILURE';
    }
  }

  async updatePageObject(
    pageName: string,
    locatorUpdates: Record<string, string>
  ): Promise<void> {
    try {
      const existingCode = this.fileSystemService.loadPageObject(pageName);

      if (!existingCode) {
        this.logger.warn(`Page object ${pageName} not found`);
        return;
      }

      let updatedCode = existingCode;

      // Update locators in the page object
      for (const [locatorName, newSelector] of Object.entries(locatorUpdates)) {
        // Find and replace selector assignments
        const pattern = new RegExp(
          `this\\.page\\.locator\\(['"\`].*?['"\`]\\)\\s*\\n\\s*// ${locatorName}`,
          'g'
        );
        updatedCode = updatedCode.replace(
          pattern,
          `this.page.locator('${newSelector}')\n      // ${locatorName}`
        );
      }

      this.fileSystemService.savePageObject(pageName, updatedCode);
      this.logger.info(`Page object ${pageName} updated with new locators`);
    } catch (error) {
      this.logger.error('Error updating page object', error);
    }
  }
}
