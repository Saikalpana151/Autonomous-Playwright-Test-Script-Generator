// Orchestrator Agent - Main controller for the autonomous test automation system
import * as fs from 'fs';
import * as readline from 'readline';
import { Logger } from '../services/logger';
import { ConfigService } from '../services/config';
import { LLMService } from '../services/llm';
import { ExcelService } from '../services/excel';
import { FileSystemService } from '../services/filesystem';
import {
  ExecutionContext,
  LLMConnectionStatus,
  MCPConnectionStatus,
  FinalReport,
  ExcelRow,
  ProgressEvent,
} from '../types';
import { ExplorerAgent } from './explorer.js';
import { PlannerAgent } from './planner.js';
import { GeneratorAgent } from './generator.js';
import { ExecutorAgent } from './executor.js';
import { HealerAgent } from './healer.js';
import { ReportAgent } from './report.js';

export type ProgressCallback = (event: ProgressEvent) => void;

export class OrchestratorAgent {
  private logger: Logger;
  private configService: ConfigService;
  private llmService: LLMService;
  private excelService: ExcelService;
  private fileSystemService: FileSystemService;
  private explorerAgent: ExplorerAgent;
  private plannerAgent: PlannerAgent;
  private generatorAgent: GeneratorAgent;
  private executorAgent: ExecutorAgent;
  private healerAgent: HealerAgent;
  private reportAgent: ReportAgent;
  private llmConnectionStatus: LLMConnectionStatus;
  private mcpConnectionStatus: MCPConnectionStatus;
  private progressCallback: ProgressCallback | null = null;

  constructor(
    logger: Logger,
    _configService: ConfigService,
    llmService: LLMService,
    excelService: ExcelService,
    fileSystemService: FileSystemService,
    explorerAgent: ExplorerAgent,
    plannerAgent: PlannerAgent,
    generatorAgent: GeneratorAgent,
    executorAgent: ExecutorAgent,
    healerAgent: HealerAgent,
    reportAgent: ReportAgent
  ) {
    this.logger = logger;
    this.configService = _configService;
    this.llmService = llmService;
    this.excelService = excelService;
    this.fileSystemService = fileSystemService;
    this.explorerAgent = explorerAgent;
    this.plannerAgent = plannerAgent;
    this.generatorAgent = generatorAgent;
    this.executorAgent = executorAgent;
    this.healerAgent = healerAgent;
    this.reportAgent = reportAgent;
    this.llmConnectionStatus = {
      connected: false,
      model: _configService.get('geminiModel'),
      connectionTime: '',
    };
    this.mcpConnectionStatus = {
      connected: false,
      connectionTime: '',
    };
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  private emitProgress(event: ProgressEvent): void {
    if (this.progressCallback) {
      this.progressCallback(event);
    }
  }

  async validateConnections(): Promise<boolean> {
    try {
      this.logger.info('==================================================');
      this.logger.info('Validating system connectivity...');
      this.logger.info('==================================================');

      // Validate LLM Connection
      try {
        this.logger.info('Validating LLM connection...');
        this.llmConnectionStatus = await this.llmService.validateConnection();
        this.logger.info('✓ LLM Connection Status: Connected Successfully');
        this.logger.info(`  Model: ${this.llmConnectionStatus.model}`);
        this.logger.info(`  Connection Time: ${this.llmConnectionStatus.connectionTime}`);
      } catch (error) {
        this.logger.error('✗ LLM Connection Failed', error);
        this.llmConnectionStatus.connected = false;
        return false;
      }

      // MCP Connection is optional - will be handled by Explorer Agent
      this.logger.info('MCP Connection validation will be performed by Explorer Agent');

      this.logger.info('==================================================');
      this.logger.info('System connectivity validation completed successfully');
      this.logger.info('==================================================\n');

      return true;
    } catch (error) {
      this.logger.error('Connectivity validation failed', error);
      return false;
    }
  }

  async getUserStory(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('\n📋 Enter your User Story: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async executeWorkflow(): Promise<FinalReport | null> {
    try {
      // Step 1: Validate connections
      const connectionsValid = await this.validateConnections();
      if (!connectionsValid) {
        throw new Error('System connectivity validation failed');
      }

      // Step 2: Get user story
      const userStory = await this.getUserStory();
      if (!userStory) {
        throw new Error('User story is required');
      }

      return this.executeWorkflowWithStory(userStory);
    } catch (error) {
      this.logger.error('Workflow execution failed', error);
      return null;
    }
  }

  async executeWorkflowWithStory(userStory: string): Promise<FinalReport | null> {
    try {
      this.logger.info('==================================================');
      this.logger.info('Starting autonomous test automation workflow');
      this.logger.info('==================================================');
      this.logger.info(`User Story: ${userStory}\n`);

      this.emitProgress({
        type: 'status',
        message: 'Configuration validated',
        timestamp: new Date().toISOString(),
      });

      const resolvedCredentials = this.resolveCredentials(userStory);

      // Initialize execution context
      const context: ExecutionContext = {
        userStory,
        scenario: '',
        applicationMap: null,
        testPlan: null,
        generatedTest: null,
        executionResults: null,
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        resolvedCredentials,
      };

      // Step 3: Check if exact scenario already exists and still has the required executable artifacts
      let existingScenario = this.excelService.scenarioExists(userStory);
      let scenarioReused = false;

      if (existingScenario) {
        const mapExists = existingScenario.applicationMapName
          ? !!this.fileSystemService.loadApplicationMap(existingScenario.applicationMapName)
          : false;
        const generatedSpecExists = fs.existsSync(this.fileSystemService.getGeneratedTestsFile());
        const requiredPageObjectsExist = this.pageObjectsExistForCurrentStory(userStory);

        if (mapExists && generatedSpecExists && requiredPageObjectsExist) {
          this.logger.info('✓ Found exact matching executable scenario in repository', {
            scenario: existingScenario.scenario,
          });
          context.scenario = existingScenario.scenario;
          scenarioReused = true;
          this.emitProgress({
            type: 'step-complete',
            message: 'Existing scenario checked',
            details: { skipped: false, scenario: existingScenario.scenario },
            timestamp: new Date().toISOString(),
          });
        } else {
          this.logger.warn('Exact scenario row exists but artifacts are missing or invalid. Regenerating from the live User Story...');
          existingScenario = null;
        }
      }

      // Step 4: Invoke Explorer Agent if needed
      if (!scenarioReused) {
        this.emitProgress({
          type: 'agent-start',
          message: 'Explorer Agent starting',
          timestamp: new Date().toISOString(),
        });
        this.logger.info('Invoking Explorer Agent...');
        context.applicationMap = await this.explorerAgent.explore(userStory, resolvedCredentials);

        if (!context.applicationMap) {
          throw new Error('Explorer Agent failed to create application map');
        }
        this.emitProgress({
          type: 'agent-end',
          message: 'Explorer Agent completed',
          details: { pagesDiscovered: Object.keys(context.applicationMap.pages).length },
          timestamp: new Date().toISOString(),
        });
      } else {
        // Load application map from repository
        if (existingScenario) {
          context.applicationMap = this.fileSystemService.loadApplicationMap(
            existingScenario.applicationMapName
          );
        }
        this.emitProgress({
          type: 'step-complete',
          message: 'Explorer skipped - using existing application map',
          timestamp: new Date().toISOString(),
        });
      }

      // Step 5: Invoke Planner Agent if needed
      if (!scenarioReused && context.applicationMap) {
        this.emitProgress({
          type: 'agent-start',
          message: 'Planner Agent starting',
          timestamp: new Date().toISOString(),
        });
        this.logger.info('Invoking Planner Agent...');
        context.testPlan = await this.plannerAgent.plan(
          userStory,
          context.applicationMap
        );

        if (!context.testPlan) {
          throw new Error('Planner Agent failed to create test plan');
        }

        context.scenario = context.testPlan.scenario;
        this.emitProgress({
          type: 'agent-end',
          message: 'Planner Agent completed',
          details: { steps: context.testPlan.steps.length },
          timestamp: new Date().toISOString(),
        });
      } else if (scenarioReused) {
        this.emitProgress({
          type: 'step-complete',
          message: 'Planner skipped - using existing test plan',
          timestamp: new Date().toISOString(),
        });
      }

      // Step 6: Invoke Generator Agent
      this.emitProgress({
        type: 'agent-start',
        message: 'Generator Agent starting',
        timestamp: new Date().toISOString(),
      });
      this.logger.info('Invoking Generator Agent...');
      if (context.applicationMap) {
        context.generatedTest = await this.generatorAgent.generate(
          context.scenario,
          context.applicationMap,
          context.testPlan,
          scenarioReused,
          userStory
        );
      }

      if (!context.generatedTest) {
        throw new Error('Generator Agent failed to generate test');
      }
      this.emitProgress({
        type: 'agent-end',
        message: 'Generator Agent completed',
        timestamp: new Date().toISOString(),
      });

      // Step 7: Execute test
      let executionAttempt = 1;
      let executionSuccess = false;
      context.healerInvoked = false;

      while (executionAttempt <= context.maxRetries && !executionSuccess) {
        this.logger.info(`\nExecution Attempt ${executionAttempt}/${context.maxRetries}`);
        this.emitProgress({
          type: 'agent-start',
          message: `Executor Agent starting (Attempt ${executionAttempt}/${context.maxRetries})`,
          timestamp: new Date().toISOString(),
        });

        try {
          this.logger.info('Invoking Executor Agent...');
          context.executionResults = await this.executorAgent.execute(
            context.scenario,
            'chromium',
            this.fileSystemService.getGeneratedTestsFile()
          );

          if (context.executionResults && context.executionResults.passed) {
            executionSuccess = true;
            this.logger.info('EXECUTION PASSED');
            this.emitProgress({
              type: 'agent-end',
              message: 'Executor Agent completed - PASSED',
              details: { duration: context.executionResults.duration },
              timestamp: new Date().toISOString(),
            });
          } else {
            this.logger.info('EXECUTOR FAILED');
            this.emitProgress({
              type: 'agent-end',
              message: 'Executor Agent completed - FAILED',
              details: {
                error: context.executionResults?.error,
                attempt: executionAttempt,
              },
              timestamp: new Date().toISOString(),
            });

            if (executionAttempt < context.maxRetries) {
              this.logger.info('INVOKING HEALER');
              this.emitProgress({
                type: 'agent-start',
                message: 'Healer Agent starting',
                details: { rootCause: context.executionResults?.error },
                timestamp: new Date().toISOString(),
              });
              context.healerInvoked = true;
              const healingRequired = await this.healerAgent.analyze(
                context.executionResults,
                context.applicationMap,
                context.testPlan
              );

              if (healingRequired) {
                this.logger.info('HEALER FIX APPLIED');
                this.logger.info('RETRYING EXECUTOR');
                this.emitProgress({
                  type: 'agent-end',
                  message: 'Healer Agent completed - fix applied, retrying',
                  timestamp: new Date().toISOString(),
                });
              } else {
                this.logger.warn('Healer did not apply a fix');
                this.emitProgress({
                  type: 'agent-end',
                  message: 'Healer Agent completed - no fix available',
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }

          executionAttempt++;
          context.retryCount = executionAttempt - 1;
        } catch (error) {
          this.logger.error(`Execution attempt ${executionAttempt} failed`, error);
          this.emitProgress({
            type: 'error',
            message: `Execution attempt ${executionAttempt} failed`,
            details: { error: error instanceof Error ? error.message : String(error) },
            timestamp: new Date().toISOString(),
          });
          executionAttempt++;
          context.retryCount = executionAttempt - 1;

          if (executionAttempt > context.maxRetries) {
            throw error;
          }
        }
      }

      // Step 8: Update Excel repository without letting a locked workbook fail the workflow
      try {
        if (!scenarioReused) {
          const excelRow: ExcelRow = {
            userStory,
            scenario: context.scenario,
            steps: context.testPlan
              ? context.testPlan.steps.map((s) => s.action).join(' → ')
              : '',
            applicationMapName: context.applicationMap?.name || '',
            createdDate: new Date().toISOString(),
            executionCount: 1,
            reuseCount: 0,
          };

          this.excelService.addScenario(excelRow);
        } else if (context.executionResults) {
          this.excelService.incrementExecutionCount(userStory);
        }
      } catch (error) {
        this.logger.warn('Excel repository update was skipped for this run', error);
      }

      // Step 9: Generate final report
      this.emitProgress({
        type: 'agent-start',
        message: 'Report Agent starting',
        timestamp: new Date().toISOString(),
      });
      this.logger.info('Invoking Report Agent...');
      const finalReport = await this.reportAgent.generateReport(
        context,
        this.llmConnectionStatus,
        this.mcpConnectionStatus,
        scenarioReused
      );

      context.endTime = new Date();

      this.emitProgress({
        type: 'agent-end',
        message: 'Report Agent completed',
        details: { outcome: finalReport?.finalOutcome },
        timestamp: new Date().toISOString(),
      });

      return finalReport;
    } catch (error) {
      this.logger.error('Workflow execution failed', error);
      this.emitProgress({
        type: 'error',
        message: 'Workflow execution failed',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  private resolveCredentials(userStory: string): { username: string; password: string } {
    const explicitUsername = userStory.match(/(?:username|user(?:name)?\s*[:=]\s*|login\s+with\s+|with\s+)([A-Za-z0-9_.-]+)/i)?.[1]?.trim();
    const explicitPassword = userStory.match(/(?:password\s*(?:is|=|:)?\s*)([A-Za-z0-9_.!@#$%^&*()-+=]+)/i)?.[1]?.trim();

    return {
      username: explicitUsername || this.configService.get('defaultUsername'),
      password: explicitPassword || this.configService.get('defaultPassword'),
    };
  }

  private pageObjectsExistForCurrentStory(userStory: string): boolean {
    const story = userStory.toLowerCase();
    const needsProducts = story.includes('product') || story.includes('inventory') || story.includes('add to cart') || story.includes('cart');
    const needsCart = story.includes('cart') || story.includes('add to cart');
    const needsCheckout = story.includes('checkout') || story.includes('confirm order') || story.includes('order');

    const requiredPageObjects = ['LoginPage'];
    if (needsProducts) requiredPageObjects.push('ProductsPage');
    if (needsCart) requiredPageObjects.push('CartPage');
    if (needsCheckout) requiredPageObjects.push('CheckoutPage', 'ConfirmationPage');

    return requiredPageObjects.every((pageObjectName) => {
      const pageObjectPath = `${this.fileSystemService['testDir']}/page-objects/${pageObjectName}.ts`;
      return fs.existsSync(pageObjectPath);
    });
  }

  getLLMConnectionStatus(): LLMConnectionStatus {
    return this.llmConnectionStatus;
  }

  getMCPConnectionStatus(): MCPConnectionStatus {
    return this.mcpConnectionStatus;
  }
}
