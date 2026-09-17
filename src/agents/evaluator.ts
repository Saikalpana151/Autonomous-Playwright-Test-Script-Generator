import * as fs from 'fs';
import { Logger } from '../services/logger';
import { FileSystemService } from '../services/filesystem';
import { EvaluationCategory, EvaluationCriterion, EvaluationResult, ExecutionContext, FinalReport, EvaluationResultStatus, EvidenceChainEntry } from '../types';

const categoryNames = ['explorerAccuracy', 'testPlanAccuracy', 'generatedTestAccuracy', 'executionAccuracy', 'reportAccuracy'] as const;

export class EvaluationAgent {
  constructor(private logger: Logger, _llmService: unknown, _fileSystemService: FileSystemService) {}

  async evaluate(context: ExecutionContext, report: FinalReport): Promise<EvaluationResult> {
    const evidence: Record<string, string> = { runId: context.runId };
    const chain: EvidenceChainEntry[] = [];
    const categories = {
      explorerAccuracy: this.category(this.explorerCriteria(context, evidence, chain)),
      testPlanAccuracy: this.category(this.planCriteria(context, evidence, chain)),
      generatedTestAccuracy: this.category(this.generatedCriteria(context, evidence, chain)),
      executionAccuracy: this.category(this.executionCriteria(context, evidence)),
      reportAccuracy: this.category(this.reportCriteria(context, report, evidence)),
    };
    const findings = Object.values(categories).flatMap((category) => category.criteria);
    const result: EvaluationResult = {
      ...categories,
      overallScore: this.scoreCategories(categories),
      findings,
      evidence: { ...evidence, evidenceChain: JSON.stringify(chain) },
      semanticJudgments: { evidenceChain: chain.map((entry) => this.chainCriterion(entry)) },
      generatedAt: new Date().toISOString(),
    };
    this.logger.info(`Evaluation completed: ${result.overallScore}%`, { runId: context.runId });
    return result;
  }

  private explorerCriteria(context: ExecutionContext, evidence: Record<string, string>, chain: EvidenceChainEntry[]): EvaluationCriterion[] {
    const map = context.applicationMap;
    const pages = Object.values(map?.pages || {});
    const story = context.userStory.toLowerCase();
    const requirements = this.requirements(story);
    evidence.explorer = map ? `${map.name}; workflow=${map.workflow.join(' -> ')}; pages=${pages.map((page) => page.name).join(', ')}` : 'application map missing';
    const criteria = [
      this.make('Starting application state is evidenced', 'Explorer observed a login surface', pages.some((page) => this.pageHas(page, ['username', 'password', 'login'])), 'applicationMap.pages and page elements', 2, 'User story plus live DOM evidence', context),
      this.make('Requested states are evidenced', requirements.join(', '), requirements.length > 0 ? requirements.every((requirement) => this.requirementHasEvidence(requirement, map)) : pages.length > 0, 'applicationMap.pages, workflow, and elements', 3, 'Intent mapped to observed application states', context),
      this.make('Required elements have usable evidence', 'Relevant element metadata includes selectors', pages.length > 0 && pages.some((page) => Object.values(page.elements).some((element) => Boolean(element.selector))), 'applicationMap.pages[*].elements', 2, 'Observed element evidence, not selector-string equality', context),
      this.make('Exploration is scoped to the story', 'Observed path supports requested workflow', story.includes('checkout') ? Boolean(map?.workflow.some((state) => /checkout|complete/i.test(state))) : Boolean(map?.workflow.length), 'userStory versus applicationMap.workflow', 1, 'Story requirements and observed workflow', context),
    ];
    criteria.forEach((criterion) => chain.push({ requirement: criterion.criterion, explorerEvidence: criterion.evidence, result: criterion.result, justification: criterion.reason }));
    return criteria;
  }

  private planCriteria(context: ExecutionContext, evidence: Record<string, string>, chain: EvidenceChainEntry[]): EvaluationCriterion[] {
    const plan = context.testPlan;
    const steps = plan?.steps || [];
    const requirements = this.requirements(context.userStory.toLowerCase());
    const plannerDefect = context.intentionalFailure?.enabled && context.intentionalFailure.affectedAgent === 'Planner' && !context.healerInvoked;
    evidence.plan = plan ? steps.map((step) => `${step.action}: ${step.expectedResult || ''}`).join(' | ') : 'test plan missing';
    const criteria = [
      this.make('Plan preserves the current user story', context.userStory, plan?.userStory === context.userStory, 'testPlan.userStory', 2, 'Planner output retains current-run intent', context, plan ? undefined : 'NOT_EVALUABLE'),
      this.make('Plan covers requested behavior semantically', requirements.join(', '), requirements.every((requirement) => this.requirementCovered(requirement, steps, context.userStory)), 'userStory plus testPlan.steps', 3, 'Requirements map to meaningful planner steps; one step may cover several concepts and several steps may cover one concept', context, plannerDefect ? 'FAIL' : (plan ? undefined : 'NOT_EVALUABLE')),
      this.make('Plan provides observable expected results', 'Relevant steps state observable outcomes', steps.length > 0 && steps.every((step) => Boolean(step.expectedResult?.trim())), 'testPlan.steps[].expectedResult', 1, 'Expected results are evidence inputs', context, plannerDefect ? 'FAIL' : (plan ? undefined : 'NOT_EVALUABLE')),
      this.make('Plan references the observed map', context.applicationMap?.name || 'current map', plan?.applicationMapName === context.applicationMap?.name, 'applicationMap.name versus testPlan.applicationMapName', 1, 'Planner uses current-run explorer evidence', context, plan && context.applicationMap ? undefined : 'NOT_EVALUABLE'),
    ];
    criteria.forEach((criterion) => chain.push({ requirement: criterion.criterion, plannerStep: criterion.actual, explorerEvidence: evidence.explorer, result: criterion.result, justification: criterion.reason }));
    return criteria;
  }

  private generatedCriteria(context: ExecutionContext, evidence: Record<string, string>, chain: EvidenceChainEntry[]): EvaluationCriterion[] {
    const source = fs.existsSync(context.generatedTestPath) ? fs.readFileSync(context.generatedTestPath, 'utf8') : '';
    const story = context.userStory.toLowerCase();
    const productVisibilityRequested = /at least one product|product.*visible|inventory.*visible/i.test(story);
    const individualProductEvidence = /inventory_item|has-text|filter\(\s*\{\s*hasText/i.test(source);
    evidence.generatedTest = `${context.generatedTestPath}; runId=${context.runId}; sourceLength=${source.length}; pageObjects=${context.generatedPageObjects.join(', ')}`;
    const criteria = [
      this.make('Current generated specification exists', 'A non-empty current-run spec', source.length > 0, context.generatedTestPath, 2, 'ExecutionContext.generatedTestPath', context, source ? undefined : 'NOT_EVALUABLE'),
      this.make('Implementation covers story requirements', 'Actions and assertions semantically cover the story', this.requirements(story).every((requirement) => this.implementationCovers(requirement, source)), 'userStory plus generated source', 3, 'Behavioral coverage, not action or statement counts', context, source ? undefined : 'NOT_EVALUABLE'),
      this.make('Product visibility targets an individual product', 'A product node is asserted when requested', productVisibilityRequested ? individualProductEvidence : true, productVisibilityRequested ? 'generated product locator/assertion' : 'not requested', 2, productVisibilityRequested ? 'A visible inventory container alone does not prove an individual product is visible.' : 'No individual-product requirement', context, source ? undefined : 'NOT_EVALUABLE'),
      this.make('Generated selectors are supported by Explorer evidence', 'Relevant generated interactions have Explorer support', source && context.applicationMap ? this.generatedSelectorsSupported(source, context) : false, 'applicationMap element intent plus generated interactions', 2, 'Selector differences are allowed when intent and evidence agree', context, source && context.applicationMap ? undefined : 'NOT_EVALUABLE'),
    ];
    criteria.forEach((criterion) => chain.push({ requirement: criterion.criterion, plannerStep: context.testPlan?.steps.map((step) => step.action).join(' | '), explorerEvidence: evidence.explorer, generatedImplementation: criterion.actual, result: criterion.result, justification: criterion.reason }));
    return criteria;
  }

  private executionCriteria(context: ExecutionContext, evidence: Record<string, string>): EvaluationCriterion[] {
    const result = context.executionResults;
    evidence.execution = result ? `passed=${result.passed}; attempts=${result.retryInfo.attempts}; failures=${result.retryInfo.failures.length}; logs=${result.logs.length}` : 'execution result missing';
    return [
      this.make('Execution returned current-run evidence', 'Structured Playwright result exists', Boolean(result), 'executionResults', 3, 'Executor evidence', context),
      this.make('Execution outcome is represented', 'PASS or FAIL is recorded', Boolean(result && typeof result.passed === 'boolean'), 'executionResults.passed', 2, 'Playwright result', context),
      this.make('Diagnostics are retained', 'Logs or error evidence are available', Boolean(result && (result.logs.length > 0 || result.error)), 'executionResults.logs/error', 1, 'Execution evidence', context),
      this.make('Retry state is bounded and coherent', `At most ${context.maxRetries} re-invocations`, Boolean(result && result.retryInfo.attempts <= context.maxRetries + 1 && context.retryCount <= context.maxRetries), 'ExecutionContext retry state', 2, 'Authoritative current-run retry state', context),
    ];
  }

  private reportCriteria(context: ExecutionContext, report: FinalReport, evidence: Record<string, string>): EvaluationCriterion[] {
    evidence.report = `runId=${context.runId}; outcome=${report.finalOutcome}; healing=${report.healerDetails.healingAttempts.length}`;
    return [
      this.make('Report describes the current story', context.userStory, report.userStory === context.userStory, 'finalReport.userStory', 2, 'Final report versus current context', context),
      this.make('Final outcome matches execution evidence', context.executionResults?.passed ? 'SUCCESS' : 'FAILED', report.finalOutcome === (context.executionResults?.passed ? 'SUCCESS' : 'FAILED'), 'executionResults versus finalReport.finalOutcome', 3, 'Execution evidence and final report', context, context.executionResults ? undefined : 'NOT_EVALUABLE'),
      this.make('Healing history is authoritative and consistent', `${context.healerInvocationCount} invocation(s)`, report.healerDetails.iterations === context.healerInvocationCount && report.healerDetails.healingAttempts.length === context.healingRecords.length, 'ExecutionContext.healingRecords versus finalReport.healerDetails', 2, 'One shared healing history', context),
      this.make('Report exposes current-run artifacts', context.generatedTestPath, report.generatedFiles.includes(context.generatedTestPath), 'finalReport.generatedFiles', 1, 'Current run artifact references', context),
    ];
  }

  private make(criterion: string, expected: string, actualOrPassed: string | boolean, evidence: string, weight: number, objective: string, context: ExecutionContext, forced?: EvaluationResultStatus): EvaluationCriterion {
    void context;
    const actual = typeof actualOrPassed === 'boolean' ? (actualOrPassed ? 'supported' : 'not supported') : actualOrPassed;
    const result: EvaluationResultStatus = forced || (typeof actualOrPassed === 'boolean' ? (actualOrPassed ? 'PASS' : 'FAIL') : actualOrPassed !== 'missing' ? 'PASS' : 'NOT_EVALUABLE');
    const contribution = result === 'PASS' ? weight : result === 'PARTIAL' ? weight * 0.5 : 0;
    return { criterion, category: objective, weight, expected, actual, whatWasEvaluated: objective, objective, semanticMapping: `${expected} -> ${actual}`, evidence, result, reason: result === 'PASS' ? 'Current-run evidence supports the criterion.' : result === 'NOT_EVALUABLE' ? 'Evidence is unavailable; no failure is inferred.' : 'Current-run evidence does not support the criterion.', justification: 'The result is based on observable evidence from the named stages.', gaps: result === 'PASS' ? '' : 'Review the named source stage or collect additional evidence.', impact: result === 'FAIL' ? 'Reduces confidence in the affected stage.' : 'No material gap observed.', confidence: result === 'NOT_EVALUABLE' ? 'LOW' : 'MEDIUM', defectAttribution: result === 'FAIL' ? objective : 'None identified', recommendation: result === 'FAIL' ? 'Inspect the affected stage and its evidence.' : 'No action required.', scoreContribution: contribution, scoreCalculation: `${result} = ${contribution}/${weight}`, sourceOfTruth: evidence, crossStageConsistency: objective, severity: result === 'FAIL' ? 'HIGH' : 'LOW' };
  }

  private category(criteria: EvaluationCriterion[]): EvaluationCategory {
    const evaluable = criteria.filter((criterion) => criterion.result !== 'NOT_EVALUABLE');
    const denominator = evaluable.reduce((sum, criterion) => sum + (criterion.weight || 1), 0);
    const score = denominator ? Math.round(evaluable.reduce((sum, criterion) => sum + (criterion.scoreContribution || 0), 0) / denominator * 100) : 0;
    return { score, weight: 1, criteria, explanation: `${criteria.filter((criterion) => criterion.result === 'PASS').length} PASS, ${criteria.filter((criterion) => criterion.result === 'PARTIAL').length} PARTIAL, ${criteria.filter((criterion) => criterion.result === 'FAIL').length} FAIL, ${criteria.filter((criterion) => criterion.result === 'NOT_EVALUABLE').length} NOT_EVALUABLE`, evidence: criteria.map((criterion) => criterion.evidence) };
  }

  private scoreCategories(categories: Record<string, EvaluationCategory>): number {
    const scored = categoryNames.map((key) => categories[key]).filter((category) => category.criteria.some((criterion) => criterion.result !== 'NOT_EVALUABLE'));
    return scored.length ? Math.round(scored.reduce((sum, category) => sum + category.score, 0) / scored.length) : 0;
  }

  private requirements(story: string): string[] {
    const requirements = ['login'];
    if (/product|inventory|item/i.test(story)) requirements.push('products');
    if (/add.*cart|cart/i.test(story)) requirements.push('cart');
    if (/navigate|open|page|state|cart/i.test(story)) requirements.push('navigation');
    if (/verify|check|assert|confirm|appear|visible|correct|name/i.test(story)) requirements.push('verification');
    if (/checkout|first\s+name|last\s+name|zip|postal|finish|thank\s+you|order\s+confirmation/i.test(story)) requirements.push('checkout');
    if (/error|locked|invalid/i.test(story)) requirements.push('authentication error');
    return requirements;
  }

  private requirementHasEvidence(requirement: string, map: ExecutionContext['applicationMap']): boolean {
    const pages = Object.values(map?.pages || {});
    if (requirement === 'login') return pages.some((page) => this.pageHas(page, ['username', 'password']));
    if (requirement === 'products') return pages.some((page) => this.pageHas(page, ['product', 'inventory']));
    if (requirement === 'cart') return pages.some((page) => this.pageHas(page, ['cart']));
    if (requirement === 'checkout') return pages.some((page) => this.pageHas(page, ['checkout', 'firstname', 'postal', 'finish', 'complete']));
    return pages.some((page) => this.pageHas(page, ['error', 'message']));
  }

  private pageHas(page: { name: string; elements: Record<string, { label?: string; selector: string }> }, terms: string[]): boolean {
    const haystack = `${page.name} ${Object.entries(page.elements).map(([key, value]) => `${key} ${value.label || ''} ${value.selector}`).join(' ')}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  }

  private requirementCovered(requirement: string, steps: NonNullable<ExecutionContext['testPlan']>['steps'], story: string): boolean {
    const planText = steps.map((step) => `${step.action} ${step.description} ${step.expectedResult || ''}`).join(' ');
    if (requirement === 'login') return /login|log\s+in|credential|authentication|sign\s+in/i.test(planText);
    if (requirement === 'navigation') return /navigate|open|go\s+to|page|state|cart/i.test(planText);
    if (requirement === 'products') {
      const requestedProducts = [...story.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1].toLowerCase());
      const namesCovered = requestedProducts.length === 0 || requestedProducts.every((name) => this.productMentionCovered(name, planText));
      return namesCovered && /product|products|item|items|add|cart/i.test(planText);
    }
    if (requirement === 'cart') return /cart|basket|shopping/i.test(planText);
    if (requirement === 'verification') return /verify|check|assert|confirm|appear|visible|correct|contains|name/i.test(planText);
    if (requirement === 'authentication error') return /error|locked|invalid/i.test(planText);
    return new RegExp(requirement, 'i').test(planText);
  }

  private productMentionCovered(productName: string, planText: string): boolean {
    const normalizedPlan = planText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const words = productName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
    const suffixes = words.map((_word, index) => words.slice(index).join(' ')).filter((suffix) => suffix.length > 2);
    return suffixes.some((suffix) => normalizedPlan.includes(suffix));
  }

  private implementationCovers(requirement: string, source: string): boolean {
    if (requirement === 'login') return /goto|login-button|user-name|username/i.test(source);
    if (requirement === 'navigation') return /goto|toHaveURL|click/i.test(source);
    if (requirement === 'products') return /inventory|product|add-to-cart/i.test(source);
    if (requirement === 'cart') return /cart/i.test(source);
    if (requirement === 'checkout') return /checkout|firstName|lastName|postalCode|finish|complete-header/i.test(source);
    if (requirement === 'verification') return /expect|toBeVisible|toHaveText|toContainText|toHaveURL/i.test(source);
    return /error|locked out|not match/i.test(source);
  }

  private generatedSelectorsSupported(source: string, context: ExecutionContext): boolean {
    const selectors = Object.values(context.applicationMap?.elements || {});
    const labels = Object.keys(context.applicationMap?.elements || {}).map((key) => key.toLowerCase());
    return selectors.some((selector) => source.includes(selector)) || labels.some((label) => source.toLowerCase().includes(label.replace(/[^a-z]/g, '')));
  }

  private chainCriterion(entry: EvidenceChainEntry): EvaluationCriterion {
    return { criterion: entry.requirement, expected: entry.requirement, actual: entry.generatedImplementation || entry.explorerEvidence || 'observed evidence', evidence: entry.executionEvidence || entry.explorerEvidence || 'current-run evidence', result: entry.result, reason: entry.justification, severity: entry.result === 'FAIL' ? 'HIGH' : 'LOW' };
  }
}
