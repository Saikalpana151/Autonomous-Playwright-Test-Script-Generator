// Report Agent - Generates comprehensive final reports
import { Logger } from '../services/logger';
import { FileSystemService } from '../services/filesystem';
import {
  ExecutionContext,
  FinalReport,
  LLMConnectionStatus,
  MCPConnectionStatus,
  ExplorerDetails,
  GeneratorDetails,
  ExecutorDetails,
  HealerDetails,
  TestResultsSummary,
  RetrySummary,
} from '../types';

export class ReportAgent {
  private logger: Logger;
  private fileSystemService: FileSystemService;

  constructor(logger: Logger, fileSystemService: FileSystemService) {
    this.logger = logger;
    this.fileSystemService = fileSystemService;
  }

  async generateReport(
    context: ExecutionContext,
    llmStatus: LLMConnectionStatus,
    _mcpStatus: MCPConnectionStatus,
    scenarioReused: boolean
  ): Promise<FinalReport> {
    try {
      this.logger.info('\n==================================================');
      this.logger.info('Report Agent: Generating final report');
      this.logger.info('==================================================\n');

      const finalReport: FinalReport = {
        timestamp: new Date().toISOString(),
        systemConnectivity: {
          llmStatus,
        },
        userStory: context.userStory,
        scenario: context.scenario,
        existingScenarioReused: scenarioReused,
        applicationMap: context.applicationMap,
        testPlan: context.testPlan || null,
        actualWorkflow: context.applicationMap?.workflow || [],
        plannerStatus: context.testPlan ? 'Completed' : 'Not Required',
        excelStatus: scenarioReused ? 'Reused from Excel' : 'Added to Excel',
        generatedFiles: this.getGeneratedFiles(),
        explorerDetails: this.buildExplorerDetails(context),
        generatorDetails: this.buildGeneratorDetails(context, scenarioReused),
        executorDetails: this.buildExecutorDetails(context),
        healerDetails: this.buildHealerDetails(context),
        testResults: this.buildTestResults(context),
        retrySummary: this.buildRetrySummary(context),
        finalOutcome: context.executionResults?.passed ? 'SUCCESS' : 'FAILED',
      };

      // Display report
      this.displayReport(finalReport);

      // Save report to JSON
      this.fileSystemService.saveJson('execution-report.json', finalReport);

      this.logger.info('✓ Final report generated and saved');
      this.logger.info('==================================================\n');

      return finalReport;
    } catch (error) {
      this.logger.error('Report Agent failed', error);
      throw error;
    }
  }

  private getGeneratedFiles(): string[] {
    const files = [
      'repositories/application-maps/*.json',
      'repositories/tests/generated-scenarios.spec.ts',
      'repositories/tests/page-objects/*.ts',
      'test-artifacts/execution-report.json',
      'test-plans.xlsx',
    ];

    return files;
  }

  private buildExplorerDetails(context: ExecutionContext): ExplorerDetails {
    const workflow = context.applicationMap?.workflow || [];
    const elements = context.applicationMap?.elements || {};
    const pages = context.applicationMap?.pages || {};

    return {
      started: true,
      connected: true,
      pagesExplored: Object.keys(pages).length,
      workflowIdentified: workflow,
      elementsDiscovered: Object.keys(elements).length,
      startTime: context.startTime.toISOString(),
      endTime: context.endTime?.toISOString() || new Date().toISOString(),
    };
  }

  private buildGeneratorDetails(
    context: ExecutionContext,
    scenarioReused: boolean
  ): GeneratorDetails {
    const generatedNewTest = !scenarioReused && !!context.generatedTest;

    return {
      generatedNewTest,
      reuseExistingTest: scenarioReused,
      testFile: 'repositories/tests/generated-scenarios.spec.ts',
      createdAt: context.testPlan?.createdAt || new Date().toISOString(),
    };
  }

  private buildExecutorDetails(context: ExecutionContext): ExecutorDetails {
    // Calculate accurate step count from test plan
    const stepCount = (context.testPlan?.steps || []).length;
    // Use test duration from execution results if available
    const duration = context.executionResults?.duration || 0;

    return {
      browserUsed: context.executionResults?.browser || 'chromium',
      executionSteps: stepCount,
      testDuration: duration,
      artifactsPath: 'test-artifacts',
    };
  }

  private buildHealerDetails(context: ExecutionContext): HealerDetails {
    const failures = context.executionResults?.retryInfo.failures || [];
    const lastFailure = failures[failures.length - 1];
    const triggered = Boolean(
      context.healerInvoked ||
      failures.length > 0 ||
      (!!context.executionResults && !context.executionResults.passed && context.retryCount > 0)
    );

    return {
      triggered,
      rootCause: lastFailure?.rootCause,
      fixStrategy: lastFailure?.healingStrategy,
      agentsInvoked: triggered ? ['Healer', 'Executor'] : [],
      iterations: context.retryCount,
      filesUpdated: [
        'repositories/tests/page-objects/*.ts',
        'repositories/tests/generated-scenarios.spec.ts',
      ],
    };
  }

  private buildTestResults(context: ExecutionContext): TestResultsSummary {
    const passed = context.executionResults?.passed || false;

    return {
      passed,
      passedCount: passed ? 1 : 0,
      failedCount: passed ? 0 : 1,
      errorMessage: context.executionResults?.error,
    };
  }

  private buildRetrySummary(context: ExecutionContext): RetrySummary {
    const failures = context.executionResults?.retryInfo.failures || [];

    const summary: RetrySummary = {
      attempt1: failures.length > 0 ? 'failed' : 'passed',
    };

    if (failures.length > 0 && context.retryCount > 1) {
      summary.attempt2 = failures.length > 1 ? 'failed' : 'passed';
    }

    if (failures.length > 1 && context.retryCount > 2) {
      summary.attempt3 = failures.length > 2 ? 'failed' : 'passed';
    }

    return summary;
  }

  private displayReport(report: FinalReport): void {
    this.logger.info('╔════════════════════════════════════════════════════════════╗');
    this.logger.info('║          AUTONOMOUS TEST AUTOMATION FINAL REPORT            ║');
    this.logger.info('╚════════════════════════════════════════════════════════════╝\n');

    // System Connectivity
    this.logger.info('📡 SYSTEM CONNECTIVITY STATUS');
    this.logger.info('─────────────────────────────────────────────────────────────');
    this.logger.info(`  LLM Connection:  ${report.systemConnectivity.llmStatus.connected ? '✓ Connected' : '✗ Failed'}`);
    this.logger.info(`  LLM Model:       ${report.systemConnectivity.llmStatus.model}`);
    this.logger.info('');

    // Test Execution
    this.logger.info('🧪 TEST EXECUTION SUMMARY');
    this.logger.info('─────────────────────────────────────────────────────────────');
    this.logger.info(`  User Story:       ${report.userStory}`);
    this.logger.info(`  Scenario:         ${report.scenario}`);
    this.logger.info(`  Scenario Reused:  ${report.existingScenarioReused ? 'Yes' : 'No'}`);
    this.logger.info(`  Browser:          ${report.executorDetails.browserUsed}`);
    this.logger.info(`  Test Duration:    ${report.executorDetails.testDuration}ms`);
    this.logger.info('');

    // Agent Execution
    const executorText = report.executorDetails.executionSteps > 0
      ? `✓ Executed (${report.executorDetails.executionSteps} steps in ${report.executorDetails.testDuration}ms)`
      : `✓ Executed (${report.executorDetails.testDuration}ms)`;
    const healerText = report.healerDetails.triggered
      ? `✓ Invoked (${Math.max(report.healerDetails.iterations, 1)} iteration${report.healerDetails.iterations === 1 ? '' : 's'})`
      : '◯ Not Required';

    this.logger.info('🤖 AGENT EXECUTION DETAILS');
    this.logger.info('─────────────────────────────────────────────────────────────');
    this.logger.info(`  Explorer:   ✓ Completed (${report.explorerDetails.pagesExplored} pages explored)`);
    this.logger.info(`  Planner:    ✓ ${report.plannerStatus}`);
    this.logger.info(`  Generator:  ✓ ${report.generatorDetails.generatedNewTest ? 'Generated New Test' : 'Reused Test'}`);
    this.logger.info(`  Executor:   ${executorText}`);
    this.logger.info(`  Healer:     ${healerText}`);
    this.logger.info('');

    // Test Results
    this.logger.info('✅ TEST RESULTS');
    this.logger.info('─────────────────────────────────────────────────────────────');
    this.logger.info(`  Final Outcome:  ${report.testResults.passed ? '✓ PASSED' : '✗ FAILED'}`);
    this.logger.info(`  Passed Tests:   ${report.testResults.passedCount}`);
    this.logger.info(`  Failed Tests:   ${report.testResults.failedCount}`);
    if (report.testResults.errorMessage) {
      this.logger.info(`  Error:          ${report.testResults.errorMessage}`);
    }
    this.logger.info('');

    // Generated Files
    this.logger.info('📁 GENERATED FILES');
    this.logger.info('─────────────────────────────────────────────────────────────');
    report.generatedFiles.forEach((file) => {
      this.logger.info(`  • ${file}`);
    });
    this.logger.info('');

    // Excel Status
    this.logger.info('📊 REPOSITORY STATUS');
    this.logger.info('─────────────────────────────────────────────────────────────');
    this.logger.info(`  Excel Status:   ${report.excelStatus}`);
    this.logger.info(`  Application Map: ${report.applicationMap?.name || 'N/A'}`);
    this.logger.info('');

    this.logger.info('╔════════════════════════════════════════════════════════════╗');
    this.logger.info(`║  STATUS: ${report.finalOutcome === 'SUCCESS' ? '✓ SUCCESS' : '✗ FAILED'}${' '.repeat(49 - ('STATUS: ' + (report.finalOutcome === 'SUCCESS' ? '✓ SUCCESS' : '✗ FAILED')).length)}║`);
    this.logger.info('╚════════════════════════════════════════════════════════════╝\n');
  }
}
