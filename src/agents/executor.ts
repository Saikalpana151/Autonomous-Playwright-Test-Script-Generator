// Executor Agent - Executes the generated tests
import { spawnSync } from 'child_process';
import * as path from 'path';
import { Logger } from '../services/logger';
import { PlaywrightService } from '../services/playwright';
import { ConfigService } from '../services/config';
import { ExecutionResults } from '../types';

export class ExecutorAgent {
  private logger: Logger;

  constructor(
    logger: Logger,
    _playwrightService: PlaywrightService,
    _configService: ConfigService
  ) {
    this.logger = logger;
  }

  async execute(
    scenario: string,
    browser: 'chromium' | 'firefox' | 'webkit' | 'edge' = 'chromium',
    generatedSpecPath: string = 'repositories/tests/generated-scenarios.spec.ts'
  ): Promise<ExecutionResults | null> {
    const startTime = new Date();

    try {
      this.logger.info('\n==================================================');
      this.logger.info('Executor Agent: Executing test scenario');
      this.logger.info('==================================================');
      this.logger.info(`Scenario: ${scenario}`);
      this.logger.info(`Browser: ${browser}`);
      this.logger.info(`Spec file: ${generatedSpecPath}`);

      const results: ExecutionResults = {
        scenario,
        passed: false,
        duration: 0,
        startTime: startTime.toISOString(),
        endTime: '',
        browser,
        steps: [],
        screenshots: [],
        traces: [],
        videos: [],
        logs: [],
        retryInfo: {
          attempts: 1,
          failures: [],
        },
      };

      const resolvedSpecPath = path.resolve(process.cwd(), generatedSpecPath);
      const normalizedSpecPath = resolvedSpecPath.replace(/\\/g, '/');
      const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      const scenarioPattern = scenario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const args = [
        'playwright',
        'test',
        normalizedSpecPath,
        '--grep',
        scenarioPattern,
        '--reporter=line',
      ];

      const execution = spawnSync(command, args, {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });

      const stdout = execution.stdout || '';
      const stderr = execution.stderr || '';
      results.logs = [stdout, stderr].filter(Boolean);

      if (execution.error) {
        results.error = execution.error.message;
      } else if (execution.status !== 0) {
        results.error = (stderr || stdout || 'Playwright test failed').trim();
      }

      results.passed = execution.status === 0;
      if (results.passed) {
        this.logger.info('EXECUTION PASSED');
      } else {
        this.logger.info('EXECUTOR FAILED');
        this.logger.error('Playwright execution failed', results.error || 'Unknown failure');
      }

      const endTime = new Date();
      results.endTime = endTime.toISOString();
      results.duration = endTime.getTime() - startTime.getTime();

      this.logger.info(`✓ Execution completed in ${results.duration}ms`);
      this.logger.info(`✓ Status: ${results.passed ? 'PASSED' : 'FAILED'}`);
      this.logger.info('==================================================\n');

      return results;
    } catch (error) {
      this.logger.error('Executor Agent failed', error);
      const endTime = new Date();
      return {
        scenario,
        passed: false,
        duration: endTime.getTime() - startTime.getTime(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        browser,
        steps: [],
        screenshots: [],
        traces: [],
        videos: [],
        logs: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        retryInfo: {
          attempts: 1,
          failures: [],
        },
      };
    }
  }

}
