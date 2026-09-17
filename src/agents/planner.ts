// Planner Agent - Creates test plans from application maps and user stories
import { Logger } from '../services/logger';
import { LLMService } from '../services/llm';
import { ApplicationMap, TestPlan, TestStep } from '../types';

export class PlannerAgent {
  private logger: Logger;
  private llmService: LLMService;

  constructor(logger: Logger, llmService: LLMService) {
    this.logger = logger;
    this.llmService = llmService;
  }

  async plan(userStory: string, applicationMap: ApplicationMap): Promise<TestPlan | null> {
    try {
      this.logger.info('\n==================================================');
      this.logger.info('Planner Agent: Creating test plan');
      this.logger.info('==================================================');
      this.logger.info(`User Story: ${userStory}`);

      // Analyze user story with LLM to create detailed plan
      const testPlan = await this.createTestPlan(userStory, applicationMap);

      if (!testPlan) {
        throw new Error('Failed to create test plan');
      }

      this.logger.info(`✓ Test Plan Created: ${testPlan.scenario}`);
      this.logger.info(`✓ Steps: ${testPlan.steps.length}`);
      this.logger.info(`✓ Workflow: ${testPlan.steps.map((s) => s.action).join(' → ')}`);
      this.logger.info('==================================================\n');

      return testPlan;
    } catch (error) {
      this.logger.error('Planner Agent failed', error);
      return null;
    }
  }

  private async createTestPlan(
    userStory: string,
    applicationMap: ApplicationMap
  ): Promise<TestPlan | null> {
    try {
      const appMapJson = JSON.stringify(applicationMap, null, 2);

      // Use LLM to generate test plan
      const llmResponse = await this.llmService.generateTestPlan(userStory, appMapJson);

      // Parse LLM response to extract test plan
      const testPlan = this.parseTestPlan(llmResponse, userStory, applicationMap);

      return testPlan;
    } catch (error) {
      this.logger.error('Error creating test plan with LLM', error);

      // Fallback: Create test plan based on user story keywords
      return this.createDefaultTestPlan(userStory, applicationMap);
    }
  }

  private parseTestPlan(
    llmResponse: string,
    userStory: string,
    applicationMap: ApplicationMap
  ): TestPlan {
    try {
      // Try to extract JSON from LLM response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const parsedSteps = parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0
          ? parsed.steps
          : this.extractSteps(parsed);

        if (parsedSteps.length > 0) {
          return {
            scenario: parsed.scenario || this.extractScenarioName(userStory),
            userStory,
            steps: parsedSteps.map((step: any, index: number) => this.normalizeStep(step, index)),
            applicationMapName: applicationMap.name,
            createdAt: new Date().toISOString(),
          };
        }
      }
    } catch (error) {
      this.logger.debug('Error parsing LLM response for test plan', error);
    }

    // Return default plan if parsing fails or the LLM returns empty steps
    return this.createDefaultTestPlan(userStory, applicationMap);
  }

  private extractScenarioName(userStory: string): string {
    // Extract scenario name from user story
    const keywords = ['login', 'add to cart', 'checkout', 'logout', 'filter', 'sort'];
    const userStoryLower = userStory.toLowerCase();

    for (const keyword of keywords) {
      if (userStoryLower.includes(keyword)) {
        return keyword.charAt(0).toUpperCase() + keyword.slice(1);
      }
    }

    return 'Custom Test Scenario';
  }

  private extractSteps(parsed: any): TestStep[] {
    if (parsed.steps && Array.isArray(parsed.steps)) {
      return parsed.steps.map((step: any, index: number) => ({
        step: index + 1,
        action: step.action || step,
        description: step.description || '',
        expectedResult: step.expectedResult || '',
      }));
    }

    if (parsed.keySteps && Array.isArray(parsed.keySteps)) {
      return parsed.keySteps.map((step: string, index: number) => ({
        step: index + 1,
        action: step,
        description: '',
        expectedResult: '',
      }));
    }

    return [];
  }

  private normalizeStep(step: any, index: number): TestStep {
    const action = String(step.action || 'Perform the required user-story action').trim();
    const suppliedDescription = String(step.description || '').trim();
    const description = suppliedDescription && suppliedDescription.toLowerCase() !== action.toLowerCase()
      ? suppliedDescription
      : this.describeAction(action);

    return {
      step: Number(step.step) || index + 1,
      action,
      description,
      expectedResult: String(step.expectedResult || 'The expected result for this user-story action is observed').trim(),
    };
  }

  private describeAction(action: string): string {
    const normalized = action.toLowerCase();
    if (normalized.includes('navigate') || normalized.includes('open')) {
      return 'Open the target application page required by the user story.';
    }
    if (normalized.includes('login') || normalized.includes('credential')) {
      return 'Enter the requested credentials and submit the login form.';
    }
    if (normalized.includes('add') && normalized.includes('cart')) {
      return 'Locate the requested product and select its Add to cart control.';
    }
    if (normalized.includes('cart')) {
      return 'Open the cart and inspect the items added during the workflow.';
    }
    if (normalized.includes('verify') || normalized.includes('validate') || normalized.includes('assert')) {
      return 'Check the relevant UI element and compare it with the user story expectation.';
    }
    return `Perform the ${action.toLowerCase()} interaction described by the user story.`;
  }

  private createDefaultTestPlan(
    userStory: string,
    applicationMap: ApplicationMap
  ): TestPlan {
    const userStoryLower = userStory.toLowerCase().replace(/check\s+out/g, 'checkout');
    const steps: TestStep[] = [];
    let stepNum = 1;
    const isNegativeAuthFlow =
      userStoryLower.includes('locked_out') ||
      userStoryLower.includes('invalid credentials') ||
      userStoryLower.includes('error message') ||
      userStoryLower.includes('verify error') ||
      (userStoryLower.includes('login') && userStoryLower.includes('error'));
    const includesCheckout = userStoryLower.includes('checkout') || userStoryLower.includes('confirm order');
    const includesCart = userStoryLower.includes('cart') || userStoryLower.includes('add to cart') || includesCheckout;

    steps.push({
      step: stepNum++,
      action: 'Navigate to Application',
      description: 'Open the SauceDemo login page',
      expectedResult: 'Login form is visible',
    });

    if (isNegativeAuthFlow) {
      steps.push({
        step: stepNum++,
        action: 'Attempt login with provided credentials',
        description: 'Enter the username and password referenced in the user story and submit the form',
        expectedResult: 'Authentication fails and an error message is displayed',
      });

      steps.push({
        step: stepNum++,
        action: 'Verify authentication error message',
        description: 'Assert the error element is visible and contains the expected text',
        expectedResult: 'The locked-out or invalid-login message is visible',
      });
    } else {
      steps.push({
        step: stepNum++,
        action: 'Login',
        description: 'Enter valid credentials and submit login form',
        expectedResult: 'The product inventory page loads successfully',
      });

      if (userStoryLower.includes('add to cart') || userStoryLower.includes('add product') || includesCart) {
        steps.push({
          step: stepNum++,
          action: 'Add product to cart',
          description: 'Select a product and add it to the cart',
          expectedResult: 'The cart badge shows the item count',
        });
      }

      if (userStoryLower.includes('cart') || includesCart) {
        steps.push({
          step: stepNum++,
          action: 'Open cart',
          description: 'Open the shopping cart details page',
          expectedResult: 'The cart page is displayed',
        });
      }

      if (includesCheckout) {
        steps.push({
          step: stepNum++,
          action: 'Proceed through checkout',
          description: 'Enter the required information and complete checkout and confirmation',
          expectedResult: 'The order confirmation message is displayed',
        });
      }
    }

    return {
      scenario: this.extractScenarioName(userStory),
      userStory,
      steps,
      applicationMapName: applicationMap.name,
      createdAt: new Date().toISOString(),
    };
  }
}
