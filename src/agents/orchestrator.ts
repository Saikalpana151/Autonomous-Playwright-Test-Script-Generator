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
  IntentionalFailure,
} from '../types';
import { ExplorerAgent } from './explorer.js';
import { PlannerAgent } from './planner.js';
import { GeneratorAgent } from './generator.js';
import { ExecutorAgent } from './executor.js';
import { HealerAgent } from './healer.js';
import { ReportAgent } from './report.js';
import { EvaluationAgent } from './evaluator.js';

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
  private evaluationAgent: EvaluationAgent;
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
    , evaluationAgent: EvaluationAgent
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
    this.evaluationAgent = evaluationAgent;
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
        runId: `run-${Date.now()}`,
        userStory,
        scenario: '',
        applicationMap: null,
        testPlan: null,
        generatedTest: null,
        executionResults: null,
        retryCount: 0,
        maxRetries: 3,
        maxHealerAttempts: 3,
        healerInvocationCount: 0,
        executionOutcomes: [],
        startTime: new Date(),
        agentInvocations: {},
        healingRecords: [],
        generatedPageObjects: [],
        generatedTestPath: this.fileSystemService.getGeneratedTestsFile(),
        resolvedCredentials,
        recoveryHistory: [],
      };

      if (this.configService.isIntentionalFailureEnabled()) {
        context.intentionalFailure = this.selectIntentionalFailure(userStory, context.runId, this.configService.get('intentionalFailureSeed'));
        context.intentionalFailure.injectedFile = 'src/agents/orchestrator.ts';
        context.intentionalFailure.injectedLine = this.findSourceLine(context.intentionalFailure.affectedAgent || 'Executor');
        context.intentionalFailure.injectedAtStage = context.intentionalFailure.affectedAgent;
        context.recoveryHistory.push({
          stage: context.intentionalFailure.affectedAgent || 'Executor',
          agent: context.intentionalFailure.affectedAgent || 'Executor',
          action: 'INJECTED',
          route: context.intentionalFailure.recoveryRoute || [],
          reason: context.intentionalFailure.reason || 'Scenario-relevant intentional failure enabled',
          timestamp: new Date().toISOString(),
        });
      }

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

      if (context.intentionalFailure?.enabled) {
        scenarioReused = false;
        existingScenario = null;
        this.logger.info('Intentional failure validation disables repository reuse for this run');
      }

      if (!scenarioReused) {
        this.fileSystemService.clearRunArtifacts();
        this.fileSystemService.clearGeneratedPageObjects();
      }

      // Step 4: Invoke Explorer Agent if needed
      if (!scenarioReused) {
        this.emitAgentStart(context, 'Explorer');
        this.logger.info('Invoking Explorer Agent...');
        const explorerFailure = this.consumeIntentionalStageFailure(context, 'Explorer');
        context.applicationMap = await this.explorerAgent.explore(userStory, resolvedCredentials);

        if (!context.applicationMap) {
          throw new Error('Explorer Agent failed to create application map');
        }
        if (explorerFailure) {
          this.injectExplorerDefect(context);
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
        this.emitAgentStart(context, 'Planner');
        this.logger.info('Invoking Planner Agent...');
        const plannerFailure = this.consumeIntentionalStageFailure(context, 'Planner');
        context.testPlan = await this.plannerAgent.plan(userStory, context.applicationMap);
        if (plannerFailure) {
          this.logger.warn('Intentional Planner defect selected; preserving an incorrect plan for evaluation');
          this.recordRecovery(context, 'Planner', ['Planner', 'Generator', 'Executor'], 'Planner defect preserved for evaluation');
          if (context.testPlan?.steps.length) {
            const lastStep = context.testPlan.steps[context.testPlan.steps.length - 1];
            lastStep.expectedResult = '';
            lastStep.description = 'Planner defect: verification requirement omitted';
          }
        }

        if (!context.testPlan) {
          this.logger.warn('Planner failed; routing to Generator with the current User Story');
          context.scenario = this.scenarioFromUserStory(userStory);
        } else {
          context.scenario = context.testPlan.scenario;
        }
        this.emitProgress({
          type: 'agent-end',
          message: 'Planner Agent completed',
          details: { steps: context.testPlan?.steps.length || 0 },
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
      this.emitAgentStart(context, 'Generator');
      this.logger.info('Invoking Generator Agent...');
      const generatorFailure = this.consumeIntentionalStageFailure(context, 'Generator');
      if (generatorFailure) {
        this.logger.warn('Intentional Generator defect selected; generating faulty source for Executor validation');
        this.recordRecovery(context, 'Generator', ['Generator', 'Executor'], 'Generator defect injected into generated source');
      }
      if (context.applicationMap) {
        context.generatedTest = await this.generatorAgent.generate(
          context.scenario, context.applicationMap, context.testPlan, scenarioReused, userStory, context.intentionalFailure
        );
      }

      if (!context.generatedTest) {
        this.logger.warn('Generator failed; retrying Generator before Executor');
        this.emitAgentStart(context, 'Generator');
        context.generatedTest = context.applicationMap
          ? await this.generatorAgent.generate(
            context.scenario,
            context.applicationMap,
            context.testPlan,
            false,
            userStory,
            context.intentionalFailure
          )
          : null;
        if (!context.generatedTest) {
          throw new Error('Generator Agent failed to generate test');
        }
      }
      context.generatedPageObjects = context.applicationMap
        ? Object.values(context.applicationMap.pages)
          .map((page) => `${page.name}.ts`)
          .filter((file, index, files) => files.indexOf(file) === index && fs.existsSync(`repositories/tests/page-objects/${file}`))
        : [];
      if (context.generatedTest?.includes('intentional-failure:') && context.intentionalFailure) {
        const failureMatch = context.generatedTest.match(/intentional-failure:\s*([A-Z_]+);\s*seed=(\d+)/);
        context.intentionalFailure.type = failureMatch?.[1] as any || context.intentionalFailure.type;
        context.intentionalFailure.seed = failureMatch ? Number(failureMatch[2]) : context.intentionalFailure.seed;
        context.intentionalFailure.injectedDefect = `Generated source mutation: ${context.intentionalFailure.type}`;
        const sourceLocation = context.generatedTest.match(/file=([^;]+);\s*line=(\d+)/);
        context.intentionalFailure.injectedFile = sourceLocation?.[1] || context.generatedTestPath;
        context.intentionalFailure.injectedLine = sourceLocation ? Number(sourceLocation[2]) : undefined;
        context.intentionalFailure.injectedAtStage = context.intentionalFailure.affectedAgent;
        context.intentionalFailure.recordedAt = new Date().toISOString();
      }
      this.emitProgress({
        type: 'agent-end',
        message: 'Generator Agent completed',
        timestamp: new Date().toISOString(),
      });

      // Step 7: Execute test
      let executionAttempt = 0;
      let executionSuccess = false;
      context.healerInvoked = false;

      while (executionAttempt <= context.maxRetries && !executionSuccess) {
        this.emitAgentStart(context, 'Executor');
        executionAttempt++;
        const retryAttempt = executionAttempt - 1;
        this.logger.info(retryAttempt === 0 ? '\nInitial execution' : `\nExecution retry Attempt ${retryAttempt}/${context.maxRetries}`);

        try {
          this.logger.info('Invoking Executor Agent...');
          const previousFailures = context.executionResults?.retryInfo.failures || [];
          const currentExecutionResults = await this.executorAgent.execute(
            context.scenario,
            'chromium',
            context.generatedTestPath
          );
          if (currentExecutionResults) {
            currentExecutionResults.retryInfo.failures = [
              ...previousFailures,
              ...currentExecutionResults.retryInfo.failures,
            ];
          }
          context.executionResults = currentExecutionResults;
          if (context.executionResults) {
            context.executionResults.retryInfo.attempts = retryAttempt;
          }
          context.executionOutcomes.push(Boolean(currentExecutionResults?.passed));

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
            if (context.executionResults) {
              context.executionResults.retryInfo.attempts = executionAttempt;
            }
            this.emitProgress({
              type: 'agent-end',
              message: 'Executor Agent completed - FAILED',
              timestamp: new Date().toISOString(),
            });

            this.logger.info('INVOKING HEALER FOR CROSS-STAGE DIAGNOSIS');
            this.emitAgentStart(context, 'Healer');
            context.healerInvocationCount += 1;
            context.healerInvoked = true;
            const healingResult = await this.healerAgent.analyze(
              context.executionResults,
              context.applicationMap,
              context.testPlan,
              context.generatedTest || '',
              context.intentionalFailure
            );
            if (healingResult.record) context.healingRecords.push(healingResult.record);
            const diagnostic = healingResult.diagnostic;
            const suggestedAgents = diagnostic?.suggestedAgents || [];
            this.emitProgress({
              type: 'agent-end',
              message: 'Healer Agent completed - diagnostic returned',
              details: {
                classification: diagnostic?.classification,
                suggestedAgents,
                confidenceScore: diagnostic?.confidenceScore,
                rootCause: diagnostic?.rootCauseExplanation,
              },
              timestamp: new Date().toISOString(),
            });
            if (executionAttempt > context.maxRetries) {
              context.retryCount = retryAttempt;
              this.logger.warn('Retry limit reached after final Healer diagnosis; stopping recovery');
              break;
            }
            if (suggestedAgents.includes('Explorer') && context.applicationMap) {
              this.recordRecovery(context, 'Explorer', ['Explorer', 'Planner', 'Generator', 'Executor'], diagnostic?.rootCauseExplanation || 'Explorer evidence requires re-validation');
              this.emitAgentStart(context, 'Explorer');
              context.applicationMap = await this.explorerAgent.explore(userStory, resolvedCredentials);
              this.emitProgress({ type: 'agent-end', message: 'Explorer Agent recovery completed', timestamp: new Date().toISOString() });
            }
            if (suggestedAgents.includes('Planner') && context.applicationMap) {
              this.recordRecovery(context, 'Planner', ['Planner', 'Generator', 'Executor'], diagnostic?.rootCauseExplanation || 'Planner alignment requires re-validation');
              this.emitAgentStart(context, 'Planner');
              context.testPlan = await this.plannerAgent.plan(userStory, context.applicationMap);
              context.scenario = context.testPlan?.scenario || context.scenario;
              this.emitProgress({ type: 'agent-end', message: 'Planner Agent recovery completed', timestamp: new Date().toISOString() });
            }
            if (suggestedAgents.includes('Generator') && context.applicationMap) {
              this.recordRecovery(context, 'Generator', ['Generator', 'Executor'], diagnostic?.rootCauseExplanation || 'Generated implementation requires regeneration');
              this.emitAgentStart(context, 'Generator');
              context.generatedTest = await this.generatorAgent.generate(context.scenario, context.applicationMap, context.testPlan, false, userStory);
              this.emitProgress({ type: 'agent-end', message: 'Generator Agent recovery completed', timestamp: new Date().toISOString() });
            }
            if (suggestedAgents.includes('Healer') && healingResult.applied && executionAttempt <= context.maxRetries) {
              this.recordRecovery(context, 'Healer', ['Healer', 'Executor'], diagnostic?.rootCauseExplanation || 'Runtime repair applied');
              this.logger.info('HEALER FIX APPLIED; RETRYING EXECUTOR');
            } else if (suggestedAgents.includes('Executor') && (healingResult.applied || suggestedAgents.some((agent) => ['Explorer', 'Planner', 'Generator'].includes(agent)))) {
              this.recordRecovery(context, 'Executor', ['Executor'], 'Re-running after upstream recovery');
            } else {
              this.logger.warn(`No safe recovery route selected for ${diagnostic?.classification || 'unknown failure'}`);
              break;
            }
          }

          context.retryCount = Math.max(0, executionAttempt - 1);
        } catch (error) {
          this.logger.error(`Execution attempt ${executionAttempt} failed`, error);
          this.emitProgress({
            type: 'error',
            message: `Execution attempt ${executionAttempt} failed`,
            details: { error: error instanceof Error ? error.message : String(error) },
            timestamp: new Date().toISOString(),
          });
          context.retryCount = Math.max(0, executionAttempt - 1);

          if (executionAttempt >= context.maxRetries) {
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

      this.emitProgress({
        type: 'agent-end',
        message: 'Report Agent completed',
        details: { outcome: finalReport?.finalOutcome },
        timestamp: new Date().toISOString(),
      });

      context.endTime = new Date();

      try {
        this.emitProgress({
          type: 'agent-start',
          message: 'Evaluation Agent starting',
          timestamp: new Date().toISOString(),
        });
        finalReport.evaluation = await this.evaluationAgent.evaluate(context, finalReport);
        this.fileSystemService.saveJson('execution-report.json', finalReport);
        this.emitProgress({
          type: 'agent-end',
          message: 'Evaluation Agent completed',
          details: { overallScore: finalReport.evaluation.overallScore },
          timestamp: new Date().toISOString(),
        });
      } catch (evaluationError) {
        this.logger.warn('Evaluation Agent failed; returning the final report without evaluation', evaluationError);
      }

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
    if (/\blocked\s+users?\b/i.test(userStory) || /\blocked[_ -]out[_ -]user\b/i.test(userStory)) {
      return { username: 'locked_out_user', password: this.configService.get('defaultPassword') };
    }
    const explicitUsername = userStory.match(/(?:username|user(?:name)?\s*[:=]\s*|login\s+with\s+)([A-Za-z0-9_.-]+)/i)?.[1]?.trim();
    const explicitPassword = userStory.match(/(?:password\s*(?:is|=|:)?\s*)([A-Za-z0-9_.!@#$%^&*()-+=]+)/i)?.[1]?.trim();

    return {
      username: explicitUsername || this.configService.get('defaultUsername'),
      password: explicitPassword || this.configService.get('defaultPassword'),
    };
  }

  private emitAgentStart(context: ExecutionContext, agentName: string): void {
    const previousInvocations = context.agentInvocations[agentName] || 0;
    context.agentInvocations[agentName] = previousInvocations + 1;
    const retryLabel = previousInvocations > 0
      ? ` (Attempt ${previousInvocations}/${context.maxRetries})`
      : '';
    this.emitProgress({
      type: 'agent-start',
      message: `${agentName} Agent starting${retryLabel}`,
      timestamp: new Date().toISOString(),
    });
  }

  private scenarioFromUserStory(userStory: string): string {
    const normalized = userStory.trim().replace(/\s+/g, ' ');
    return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
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

  private selectIntentionalFailure(userStory: string, runId: string, configuredSeed = ''): IntentionalFailure {
    const choices: IntentionalFailure[] = [
      { enabled: true, type: 'EXPLORER_FAILURE', affectedAgent: 'Explorer', reason: 'Exercise application-map recovery for the current story', recoveryRoute: ['Explorer', 'Planner', 'Generator', 'Executor'] },
      { enabled: true, type: 'PLANNER_FAILURE', affectedAgent: 'Planner', reason: 'Exercise test-plan recovery using the current application map', recoveryRoute: ['Planner', 'Generator', 'Executor'] },
      { enabled: true, type: 'GENERATOR_FAILURE', affectedAgent: 'Generator', reason: 'Exercise generated-test recovery using the current plan', recoveryRoute: ['Generator', 'Executor'] },
      { enabled: true, type: 'INCORRECT_SELECTOR', affectedAgent: 'Executor', reason: 'Exercise runtime locator healing for the current generated test', recoveryRoute: ['Healer', 'Executor'] },
    ];

    const randomValue = configuredSeed
      ? (() => {
          const hash = [...`${userStory}:${configuredSeed}:${runId}`].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
          const normalized = hash % 1000;
          return normalized / 1000;
        })()
      : Math.random();
    const index = Math.floor(randomValue * choices.length) % choices.length;
    const selected = choices[index];
    return { ...selected, seed: index, recordedAt: new Date().toISOString() };
  }

  private consumeIntentionalStageFailure(context: ExecutionContext, agent: string): boolean {
    return Boolean(
      context.intentionalFailure?.enabled &&
      context.intentionalFailure.affectedAgent === agent &&
      !context.recoveryHistory.some((record) => record.stage === agent && record.action === 'RECOVERY')
    );
  }

  private recordRecovery(context: ExecutionContext, agent: string, route: string[], reason: string): void {
    context.recoveryHistory.push({
      stage: agent,
      agent,
      action: 'RECOVERY',
      route,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  private injectExplorerDefect(context: ExecutionContext): void {
    const map = context.applicationMap;
    if (!map) return;

    const loginElements = map.pages.login?.elements;
    const usernameElement = loginElements?.username;
    if (!usernameElement) return;

    usernameElement.selector = '#intentional-invalid-user-name';
    map.elements.username = usernameElement.selector;
    this.fileSystemService.saveApplicationMap(map);

    const mapPath = `repositories/application-maps/${map.name}.json`;
    const mapSource = fs.readFileSync(mapPath, 'utf8').split(/\r?\n/);
    const changedLine = mapSource.findIndex((line) => line.includes('intentional-invalid-user-name')) + 1;
    if (context.intentionalFailure) {
      context.intentionalFailure.injectedFile = mapPath;
      context.intentionalFailure.injectedLine = changedLine;
      context.intentionalFailure.injectedAtStage = 'Explorer';
      context.intentionalFailure.injectedDefect = 'Explorer username selector changed to #intentional-invalid-user-name';
    }
    this.logger.warn(`Intentional Explorer defect injected at ${mapPath}:${changedLine}`);
  }

  private findSourceLine(agent: string): number {
    const source = fs.readFileSync('src/agents/orchestrator.ts', 'utf8').split(/\r?\n/);
    const marker = agent === 'Explorer'
      ? 'const explorerFailure ='
      : agent === 'Planner'
        ? 'const plannerFailure ='
        : agent === 'Generator'
          ? 'const generatorFailure ='
          : 'const currentExecutionResults =';
    const lineIndex = source.findIndex((line) => line.includes(marker));
    return lineIndex >= 0 ? lineIndex + 1 : 0;
  }

  getLLMConnectionStatus(): LLMConnectionStatus {
    return this.llmConnectionStatus;
  }

  getMCPConnectionStatus(): MCPConnectionStatus {
    return this.mcpConnectionStatus;
  }
}
