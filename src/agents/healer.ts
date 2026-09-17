// Healer Agent - Analyzes and fixes failing tests
import * as fs from 'fs';
import { Logger } from '../services/logger';
import { LLMService } from '../services/llm';
import { FileSystemService } from '../services/filesystem';
import { ExecutionResults, ApplicationMap, TestPlan, FailureInfo, FailureType, HealingRecord, FailureClassification, HealingDiagnostic, RecoveryAgent, IntentionalFailure } from '../types';

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
    applicationMap: ApplicationMap | null,
    testPlan: TestPlan | null,
    generatedTest = '',
    intentionalFailure?: IntentionalFailure
  ): Promise<{ applied: boolean; record?: HealingRecord; diagnostic?: HealingDiagnostic }> {
    if (!executionResults || executionResults.passed) {
      return { applied: false };
    }

    let failureType: FailureType = 'UNKNOWN_FAILURE';
    let classification: FailureClassification = 'UNKNOWN_INSUFFICIENT_EVIDENCE';
    let healingStrategy = 'No repair was applied';
    let diagnostic: HealingDiagnostic | undefined;
    try {
      this.logger.info('\n==================================================');
      this.logger.info('HEALER ANALYZING FAILURE');
      this.logger.info('==================================================');

      failureType = this.analyzeFailure(executionResults);
      classification = this.classifyFailure(failureType);
      const failureLog = executionResults.error || executionResults.logs.join('\n') || 'Unknown Playwright failure';
      diagnostic = this.buildDiagnostic(failureType, classification, failureLog, applicationMap, testPlan, generatedTest, intentionalFailure);
      this.logger.info(`Root Cause: ${failureType}`);

      if (classification === 'ENVIRONMENT_FAILURE' || classification === 'UNKNOWN_INSUFFICIENT_EVIDENCE') {
        return {
          applied: false,
          record: {
            attempt: executionResults.retryInfo.attempts,
            rootCause: failureType,
            classification,
            fixApplied: 'No repair: failure requires environment or additional evidence',
            affectedFile: this.fileSystemService.getGeneratedTestsFile(),
            affectedTest: executionResults.scenario,
            timestamp: new Date().toISOString(),
            fixSucceeded: false,
            retryResult: 'NOT_RUN',
            rootCauseExplanation: diagnostic.rootCauseExplanation,
            suggestedAgents: diagnostic.suggestedAgents,
            confidenceScore: diagnostic.confidenceScore,
            evidenceSummary: diagnostic.evidenceSummary,
          },
          diagnostic,
        };
      }

      const llmSummary = await this.llmService.analyzeFailure(
        failureLog,
        JSON.stringify({ applicationMap, testPlan, generatedTest, executionResults }, null, 2)
      );

      healingStrategy = 'Repair the generated Playwright test';
      try {
        const payload = JSON.parse(llmSummary.replace(/```json|```/gi, '').trim());
        if (payload.healingStrategy) {
          healingStrategy = payload.healingStrategy;
        }
      } catch {
        // ignore parse failure and continue with default fix
      }

      const fixed = await this.applyFixToGeneratedTest(failureLog, failureType, healingStrategy);
      const failureInfo: FailureInfo = {
        attempt: executionResults.retryInfo.attempts,
        rootCause: failureType,
        classification,
        healingStrategy,
        timestamp: new Date().toISOString(),
      };

      executionResults.retryInfo.failures.push(failureInfo);
      const record: HealingRecord = {
        attempt: failureInfo.attempt,
        rootCause: failureType,
        fixApplied: healingStrategy,
        affectedFile: this.fileSystemService.getGeneratedTestsFile(),
        affectedTest: executionResults.scenario,
        timestamp: new Date().toISOString(),
        classification,
        fixSucceeded: fixed,
        retryResult: fixed ? 'NOT_RUN' : 'NOT_RUN',
        rootCauseExplanation: diagnostic.rootCauseExplanation,
        suggestedAgents: diagnostic.suggestedAgents,
        confidenceScore: diagnostic.confidenceScore,
        evidenceSummary: diagnostic.evidenceSummary,
      };
      if (!fixed) {
        return { applied: false, record, diagnostic };
      }
      this.logger.info(`Healing Strategy: ${healingStrategy}`);
      this.logger.info('HEALER FIX APPLIED');
      this.logger.info('==================================================\n');
      return { applied: true, record, diagnostic };
    } catch (error) {
      this.logger.error('Healer Agent failed', error);
      const record: HealingRecord = {
        attempt: executionResults.retryInfo.attempts,
        rootCause: failureType,
        classification,
        fixApplied: healingStrategy,
        affectedFile: this.fileSystemService.getGeneratedTestsFile(),
        affectedTest: executionResults.scenario,
        timestamp: new Date().toISOString(),
        fixSucceeded: false,
        retryResult: 'NOT_RUN',
        rootCauseExplanation: diagnostic?.rootCauseExplanation,
        suggestedAgents: diagnostic?.suggestedAgents,
        confidenceScore: diagnostic?.confidenceScore,
        evidenceSummary: diagnostic?.evidenceSummary,
      };
      executionResults.retryInfo.failures.push({
        attempt: record.attempt,
        rootCause: record.rootCause,
        healingStrategy: record.fixApplied,
        timestamp: record.timestamp,
      });
      diagnostic = diagnostic || this.buildDiagnostic(failureType, classification, 'Healer exception', applicationMap, testPlan, generatedTest, intentionalFailure);
      return { applied: false, record, diagnostic };
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

  classifyExecutionFailure(executionResults: ExecutionResults): FailureClassification {
    return this.classifyFailure(this.analyzeFailure(executionResults));
  }

  private buildDiagnostic(
    failureType: FailureType,
    classification: FailureClassification,
    failureLog: string,
    applicationMap: ApplicationMap | null,
    testPlan: TestPlan | null,
    generatedTest: string,
    intentionalFailure?: IntentionalFailure
  ): HealingDiagnostic {
    const selectorEvidence = applicationMap
      ? Object.values(applicationMap.pages).flatMap((page) => Object.values(page.elements)).filter((element) => Boolean(element.selector)).length
      : 0;
    const planEvidence = testPlan?.steps.length || 0;
    const generatorEvidence = generatedTest.length;
    const explorerDefect = intentionalFailure?.type === 'EXPLORER_FAILURE' && intentionalFailure.affectedAgent === 'Explorer';
    const generatorDefect = intentionalFailure?.type === 'GENERATOR_FAILURE' && intentionalFailure.affectedAgent === 'Generator';
    const suggestedAgents: RecoveryAgent[] = explorerDefect
      ? ['Explorer', 'Planner', 'Generator', 'Executor']
      : generatorDefect
        ? ['Generator', 'Executor']
      : classification === 'PLAYWRIGHT_RUNTIME_FAILURE'
      ? ['Healer', 'Executor']
      : classification === 'GENERATED_TEST_FAILURE'
        ? ['Planner', 'Generator', 'Executor']
        : classification === 'ENVIRONMENT_FAILURE'
          ? ['Executor']
          : ['Explorer', 'Planner', 'Generator', 'Executor'];
    const rootCauseExplanation = explorerDefect
      ? 'Selector mismatch between Explorer evidence and Generator code: the current application map contains an invalid username selector, so Explorer must be rerun before planning and generation.'
      : generatorDefect
        ? 'Generated-test defect: the Generator injected an incorrect assertion, so the generated source must be regenerated before Executor retries.'
      : classification === 'PLAYWRIGHT_RUNTIME_FAILURE'
      ? 'The execution diagnostics indicate a browser, locator, timeout, or runtime problem after comparing the generated test with observed application evidence.'
      : classification === 'GENERATED_TEST_FAILURE'
        ? 'The failure is more consistent with a mismatch between the user story, planner steps, and generated implementation than with browser infrastructure.'
        : classification === 'ENVIRONMENT_FAILURE'
          ? 'The diagnostics indicate a network or environment problem, so code repair is not justified.'
          : 'The available evidence is insufficient to identify a trustworthy single root cause.';
    return {
      classification,
      failureType,
      rootCause: failureType,
      rootCauseExplanation,
      suggestedAgents,
      confidenceScore: Math.min(0.98, 0.4 + (failureLog ? 0.2 : 0) + (selectorEvidence > 0 ? 0.15 : 0) + (planEvidence > 0 ? 0.15 : 0) + (generatorEvidence > 0 ? 0.1 : 0)),
      evidenceSummary: `Explorer selectors=${selectorEvidence}; Planner steps=${planEvidence}; Generated source length=${generatorEvidence}; Executor diagnostics=${failureLog.slice(0, 500)}`,
    };
  }

  classifyFailure(failureType: FailureType): FailureClassification {
    if (failureType === 'NETWORK_FAILURE') return 'ENVIRONMENT_FAILURE';
    if (failureType === 'LOCATOR_FAILURE' || failureType === 'TIMEOUT_FAILURE' || failureType === 'FLAKY_FAILURE') return 'PLAYWRIGHT_RUNTIME_FAILURE';
    if (failureType === 'ASSERTION_FAILURE' || failureType === 'BUSINESS_LOGIC_FAILURE') return 'GENERATED_TEST_FAILURE';
    return 'UNKNOWN_INSUFFICIENT_EVIDENCE';
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
