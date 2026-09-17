// Main entry point for the Autonomous AI Test Automation Agent
import { Logger, LogLevel } from './services/logger';
import { ConfigService } from './services/config';
import { LLMService } from './services/llm';
import { ExcelService } from './services/excel';
import { FileSystemService } from './services/filesystem';
import { PlaywrightService } from './services/playwright';
import { OrchestratorAgent } from './agents/orchestrator';
import { ExplorerAgent } from './agents/explorer';
import { PlannerAgent } from './agents/planner';
import { GeneratorAgent } from './agents/generator';
import { ExecutorAgent } from './agents/executor';
import { HealerAgent } from './agents/healer';
import { ReportAgent } from './agents/report';
import { EvaluationAgent } from './agents/evaluator';

async function main(): Promise<void> {
  let logger: Logger | null = null;

  try {
    // Initialize services
    logger = new Logger('logs', LogLevel.INFO);

    logger.info('╔════════════════════════════════════════════════════════════╗');
    logger.info('║   Autonomous AI Test Automation Agent - Initialization     ║');
    logger.info('╚════════════════════════════════════════════════════════════╝\n');

    // Load and validate configuration
    logger.info('Loading configuration...');
    const configService = new ConfigService();
    configService.validate();
    configService.ensureDirectories();
    logger.info('✓ Configuration loaded and validated\n');

    // Initialize services
    logger.info('Initializing core services...');
    const config = configService.getConfig();

    const llmService = new LLMService(config.googleApiKey, config.geminiModel, logger);
    const excelService = new ExcelService('test-plans.xlsx', logger);
    const fileSystemService = new FileSystemService(logger);
    const playwrightService = new PlaywrightService(logger);

    logger.info('✓ Core services initialized\n');

    // Initialize agents
    logger.info('Initializing AI agents...');
    const explorerAgent = new ExplorerAgent(
      logger,
      fileSystemService,
      playwrightService,
      configService
    );

    const plannerAgent = new PlannerAgent(logger, llmService);

    const generatorAgent = new GeneratorAgent(logger, fileSystemService, llmService);

    const executorAgent = new ExecutorAgent(
      logger,
      playwrightService,
      configService
    );

    const healerAgent = new HealerAgent(logger, llmService, fileSystemService);

    const reportAgent = new ReportAgent(logger, fileSystemService);
    const evaluationAgent = new EvaluationAgent(logger, llmService, fileSystemService);

    const orchestratorAgent = new OrchestratorAgent(
      logger,
      configService,
      llmService,
      excelService,
      fileSystemService,
      explorerAgent,
      plannerAgent,
      generatorAgent,
      executorAgent,
      healerAgent,
      reportAgent
      , evaluationAgent
    );

    logger.info('✓ All AI agents initialized\n');

    // Execute main workflow
    logger.info('Starting autonomous test automation workflow...\n');

    const finalReport = await orchestratorAgent.executeWorkflow();

    if (finalReport) {
      logger.info('Workflow completed successfully');
      logger.info(`Final Status: ${finalReport.finalOutcome}`);
    } else {
      logger.error('Workflow failed to complete');
      process.exit(1);
    }

    logger.info('\n╔════════════════════════════════════════════════════════════╗');
    logger.info('║                  EXECUTION COMPLETE                         ║');
    logger.info('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    if (logger) {
      logger.error('Application error', error);
    } else {
      console.error('Fatal error during initialization:', error);
    }
    process.exit(1);
  }
}

// Run the application
main();
