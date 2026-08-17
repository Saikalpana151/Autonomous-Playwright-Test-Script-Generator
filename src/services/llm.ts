// LLM Service for Gemini API integration
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from './logger';
import { LLMConnectionStatus } from '../types';

export class LLMService {
  private client: GoogleGenerativeAI;
  private model: string;
  private logger: Logger;
  private connectionStatus: LLMConnectionStatus;

  constructor(apiKey: string, model: string, logger: Logger) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.logger = logger;
    this.connectionStatus = {
      connected: false,
      model: model,
      connectionTime: '',
    };
  }

  private getModel(systemInstruction: string) {
    return this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.3,
      },
    });
  }

  async validateConnection(): Promise<LLMConnectionStatus> {
    try {
      const startTime = new Date();
      this.logger.info('Validating LLM connection with Gemini API...');

      const model = this.getModel(
        'You are a reliable validation service. Confirm that the Gemini API is available and ready for QA automation work.'
      );

      await model.generateContent('Hello, are you ready?');

      const connectionTime = new Date();
      const duration = connectionTime.getTime() - startTime.getTime();

      this.connectionStatus = {
        connected: true,
        model: this.model,
        connectionTime: connectionTime.toISOString(),
      };

      this.logger.info(`LLM connection established successfully in ${duration}ms`, {
        model: this.model,
      });

      return this.connectionStatus;
    } catch (error) {
      this.logger.error('LLM connection validation failed', error);
      this.connectionStatus = {
        connected: false,
        model: this.model,
        connectionTime: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      throw error;
    }
  }

  async analyzeUserStory(userStory: string): Promise<string> {
    try {
      this.logger.info('Analyzing user story with Gemini', { userStory });

      const model = this.getModel(
        'You are an expert QA Test Architect and Automation Engineer. Analyze the supplied User Story, identify the relevant workflow, acceptance criteria, and UI behavior, and return a concise JSON summary that captures the scenario and its expected outcomes.'
      );

      const prompt = `Analyze the following User Story and provide:
1. Test scenario name
2. Key steps to test
3. Expected outcomes
4. Any prerequisites

User Story: ${userStory}

Respond in JSON format with fields: scenario, keySteps, expectedOutcomes, prerequisites`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      this.logger.debug('User story analysis completed', { response });

      return response;
    } catch (error) {
      this.logger.error('Error analyzing user story', error);
      throw error;
    }
  }

  async generateTestPlan(
    userStory: string,
    applicationMap: string
  ): Promise<string> {
    try {
      this.logger.info('Generating test plan with Gemini');

      const model = this.getModel(
        'You are an expert QA Test Architect and Automation Engineer. Analyze the supplied User Story and the discovered application information. Identify only the required workflow, user interactions, validation points, and acceptance criteria. Return a precise Playwright test plan based only on the supplied inputs.'
      );

      const prompt = `Analyze the following User Story and application map to create a precise Playwright test plan.

Application Map:
${applicationMap}

User Story: ${userStory}

Generate a structured test plan with steps, expected results, and test data requirements. Respond in JSON format with fields: scenario, steps (array of {step: number, action: string, expectedResult: string})`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      this.logger.debug('Test plan generated');

      return response;
    } catch (error) {
      this.logger.error('Error generating test plan', error);
      throw error;
    }
  }

  async generatePlaywrightTest(
    testPlan: string,
    applicationMap: string
  ): Promise<string> {
    try {
      this.logger.info('Generating Playwright test code with Gemini');

      const model = this.getModel(
        'You are an expert Playwright Automation Engineer. Generate a complete, valid Playwright TypeScript test from the supplied plan and application map. Use only the required page objects and selectors for the active scenario. Return only executable test code with no markdown fences.'
      );

      const prompt = `Generate a complete Playwright test code in TypeScript that implements the following test plan.

Test Plan:
${testPlan}

Application Map:
${applicationMap}

Requirements:
1. Use page object model pattern if relevant, but keep only the required objects for this scenario.
2. Include real Playwright test definitions such as test(...), expect(...), page.goto(...), locators, click, and fill.
3. Include proper error handling and assertions.
4. Include waits and synchronization.
5. Handle both success and failure scenarios.
6. Do not create markdown fences.
7. The generated code must be directly executable by Playwright and be appended to generated-scenarios.spec.ts.

Respond with only the test code, ready to be appended to a spec file.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      this.logger.debug('Playwright test code generated');

      return response;
    } catch (error) {
      this.logger.error('Error generating Playwright test', error);
      throw error;
    }
  }

  async analyzeFailure(
    failureLog: string,
    testPlan: string
  ): Promise<string> {
    try {
      this.logger.info('Analyzing test failure with Gemini');

      const model = this.getModel(
        'You are an expert QA Automation Healer. Diagnose the failing Playwright test by determining the root cause, the likely selector or assertion issue, and the smallest safe fix that will allow the test to pass without changing the user story intent.'
      );

      const prompt = `Analyze the following test failure and provide root cause analysis and healing recommendations.

Failure Log:
${failureLog}

Test Plan:
${testPlan}

Classify the failure as one of:
- LOCATOR_FAILURE
- ASSERTION_FAILURE
- BUSINESS_LOGIC_FAILURE
- TIMEOUT_FAILURE
- NETWORK_FAILURE
- FLAKY_FAILURE
- UNKNOWN_FAILURE

Respond in JSON format with fields: failureType, rootCause, healingStrategy, recommendedAgents (array)`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      this.logger.debug('Failure analysis completed');

      return response;
    } catch (error) {
      this.logger.error('Error analyzing failure', error);
      throw error;
    }
  }

  async repairPlaywrightTest(
    currentSpec: string,
    failureLog: string
  ): Promise<string> {
    try {
      this.logger.info('Repairing failing Playwright test with Gemini');

      const model = this.getModel(
        'You are a Playwright repair specialist. Fix the currently broken TypeScript test so it matches the actual UI and User Story. Return only valid Playwright code, without markdown fences or narrative text.'
      );

      const prompt = `You are fixing a broken Playwright test file. Return only the corrected Playwright TypeScript code, with no markdown fences, no explanation, and no extra text.

Current test file:
${currentSpec}

Failure log:
${failureLog}

Requirements:
- Use valid Playwright test syntax
- No markdown fences
- Remove duplicate imports and invalid selectors
- Keep the test directly executable with npx playwright test <file>
- Preserve the user story intent, including login or error message behavior
- Use stable selectors for SauceDemo elements where needed`;

      const result = await model.generateContent(prompt);
      return result.response.text().replace(/```(?:typescript)?/gi, '').trim();
    } catch (error) {
      this.logger.error('Error repairing Playwright test', error);
      throw error;
    }
  }

  getConnectionStatus(): LLMConnectionStatus {
    return this.connectionStatus;
  }
}
