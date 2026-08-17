// Web server for the Autonomous AI Test Automation Agent
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
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
import { ProgressEvent } from './types';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Global state
let orchestratorAgent: OrchestratorAgent | null = null;
let lastReport: any = null;
let isExecuting = false;
let executionClients: Response[] = [];
let logger: Logger | null = null;

// Initialize all services and agents
async function initializeServices(): Promise<void> {
  try {
    logger = new Logger('logs', LogLevel.INFO);
    logger.info('Initializing web server services...');

    // Load and validate configuration
    const configService = new ConfigService();
    configService.validate();
    configService.ensureDirectories();

    // Initialize services
    const config = configService.getConfig();
    const llmService = new LLMService(config.googleApiKey, config.geminiModel, logger);
    const excelService = new ExcelService('test-plans.xlsx', logger);
    const fileSystemService = new FileSystemService(logger);
    const playwrightService = new PlaywrightService(logger);

    // Initialize agents
    const explorerAgent = new ExplorerAgent(logger, fileSystemService, playwrightService, configService);
    const plannerAgent = new PlannerAgent(logger, llmService);
    const generatorAgent = new GeneratorAgent(logger, fileSystemService, llmService);
    const executorAgent = new ExecutorAgent(logger, playwrightService, configService);
    const healerAgent = new HealerAgent(logger, llmService, fileSystemService);
    const reportAgent = new ReportAgent(logger, fileSystemService);

    orchestratorAgent = new OrchestratorAgent(
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
    );

    // Validate connections
    await orchestratorAgent.validateConnections();
    logger.info('✓ All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

// Broadcast progress to all connected clients
function broadcastProgress(event: ProgressEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  executionClients.forEach((client) => {
    client.write(data);
  });
}

// API Routes

// Health check
app.get('/api/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    isExecuting,
    message: isExecuting ? 'Workflow is running' : 'Ready',
  });
});

// System status
app.get('/api/status', (_req: Request, res: Response): void => {
  if (!orchestratorAgent) {
    res.status(500).json({ error: 'Services not initialized' });
    return;
  }

  const llmStatus = orchestratorAgent.getLLMConnectionStatus();
  const config = new ConfigService();
  const cfg = config.getConfig();

  res.json({
    gemini: {
      connected: llmStatus.connected,
      model: cfg.geminiModel,
    },
    playwright: {
      ready: true,
    },
    agent: {
      ready: !isExecuting,
      isExecuting,
    },
  });
});

// Execute workflow with user story
app.post('/api/execute', async (req: Request, res: Response): Promise<void> => {
  if (!orchestratorAgent) {
    res.status(500).json({ error: 'Services not initialized' });
    return;
  }

  if (isExecuting) {
    res.status(409).json({ error: 'Workflow is already executing' });
    return;
  }

  const { userStory } = req.body;

  if (!userStory || typeof userStory !== 'string' || userStory.trim().length === 0) {
    res.status(400).json({ error: 'Invalid user story' });
    return;
  }

  // Set up Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  executionClients.push(res);
  isExecuting = true;

  // Set progress callback
  orchestratorAgent.setProgressCallback((event: ProgressEvent) => {
    broadcastProgress(event);
  });

  // Execute the workflow
  try {
    const finalReport = await orchestratorAgent.executeWorkflowWithStory(userStory.trim());
    lastReport = finalReport;

    broadcastProgress({
      type: 'status',
      message: 'Workflow completed',
      details: { outcome: finalReport?.finalOutcome },
      timestamp: new Date().toISOString(),
    });

    res.write('data: [DONE]\n\n');
  } catch (error) {
    broadcastProgress({
      type: 'error',
      message: 'Workflow failed with exception',
      details: { error: error instanceof Error ? error.message : String(error) },
      timestamp: new Date().toISOString(),
    });
    res.write('data: [ERROR]\n\n');
  } finally {
    isExecuting = false;
    const index = executionClients.indexOf(res);
    if (index > -1) {
      executionClients.splice(index, 1);
    }
    res.end();
  }
});

// Get last execution report
app.get('/api/last-report', (_req: Request, res: Response): void => {
  if (!lastReport) {
    res.status(404).json({ error: 'No execution report available' });
    return;
  }
  res.json(lastReport);
});

// Get generated test file
app.get('/api/generated-test', (_req: Request, res: Response): void => {
  try {
    const testFile = 'repositories/tests/generated-scenarios.spec.ts';
    if (!fs.existsSync(testFile)) {
      res.status(404).json({ error: 'Generated test file not found' });
      return;
    }

    const content = fs.readFileSync(testFile, 'utf-8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="generated-scenarios.spec.ts"');
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read generated test file' });
  }
});

// Download generated test file
app.get('/api/download/test', (_req: Request, res: Response): void => {
  try {
    const testFile = 'repositories/tests/generated-scenarios.spec.ts';
    if (!fs.existsSync(testFile)) {
      res.status(404).json({ error: 'Generated test file not found' });
      return;
    }

    res.download(testFile, 'generated-scenarios.spec.ts');
  } catch (error) {
    res.status(500).json({ error: 'Failed to download test file' });
  }
});

// Download latest application map
app.get('/api/download/appmap', (_req: Request, res: Response): void => {
  try {
    const appMapsDir = 'repositories/application-maps';
    if (!fs.existsSync(appMapsDir)) {
      res.status(404).json({ error: 'Application maps directory not found' });
      return;
    }

    const files = fs.readdirSync(appMapsDir).sort().reverse();
    if (files.length === 0) {
      res.status(404).json({ error: 'No application maps found' });
      return;
    }

    const latestMap = files[0];
    const mapPath = path.join(appMapsDir, latestMap);
    res.download(mapPath, latestMap);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download application map' });
  }
});

// Download final report
app.get('/api/download/report', (_req: Request, res: Response): void => {
  try {
    if (!lastReport) {
      res.status(404).json({ error: 'No report available' });
      return;
    }

    const reportJson = JSON.stringify(lastReport, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="execution-report.json"');
    res.send(reportJson);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download report' });
  }
});

// Get repository evidence
app.get('/api/artifacts', (_req: Request, res: Response): void => {
  try {
    const artifacts: Record<string, any> = {
      applicationMaps: [],
      tests: [],
      pageObjects: [],
      excelFile: 'test-plans.xlsx',
      testArtifacts: [],
    };

    // Application maps
    if (fs.existsSync('repositories/application-maps')) {
      artifacts.applicationMaps = fs
        .readdirSync('repositories/application-maps')
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
    }

    // Generated tests
    if (fs.existsSync('repositories/tests/generated-scenarios.spec.ts')) {
      artifacts.tests.push('generated-scenarios.spec.ts');
    }

    // Page objects
    const poDir = 'repositories/tests/page-objects';
    if (fs.existsSync(poDir)) {
      artifacts.pageObjects = fs
        .readdirSync(poDir)
        .filter((f) => f.endsWith('.ts'));
    }

    // Test artifacts
    if (fs.existsSync('test-artifacts')) {
      artifacts.testArtifacts = fs.readdirSync('test-artifacts');
    }

    res.json(artifacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// Catch-all for serving index.html for the SPA
app.get('*', (_req: Request, res: Response): void => {
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

// Start server
async function startServer(): Promise<void> {
  try {
    await initializeServices();

    app.listen(PORT, () => {
      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║     Autonomous AI Test Automation Agent - Web Server       ║`);
      console.log(`╚════════════════════════════════════════════════════════════╝\n`);
      console.log(`✓ Server running at http://localhost:${PORT}`);
      console.log(`✓ Open your browser and navigate to http://localhost:${PORT}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
