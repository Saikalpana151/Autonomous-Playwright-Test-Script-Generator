// Core type definitions and interfaces for the AI Test Automation Agent

export interface ResolvedCredentials {
  username: string;
  password: string;
}

export interface ExecutionContext {
  runId: string;
  userStory: string;
  scenario: string;
  applicationMap: ApplicationMap | null;
  testPlan: TestPlan | null;
  generatedTest: string | null;
  executionResults: ExecutionResults | null;
  retryCount: number;
  maxRetries: number;
  maxHealerAttempts: number;
  healerInvocationCount: number;
  executionOutcomes: boolean[];
  startTime: Date;
  endTime?: Date;
  healerInvoked?: boolean;
  agentInvocations: Record<string, number>;
  healingRecords: HealingRecord[];
  generatedPageObjects: string[];
  generatedTestPath: string;
  resolvedCredentials: ResolvedCredentials;
  intentionalFailure?: IntentionalFailure;
  evidenceChain?: EvidenceChainEntry[];
  recoveryHistory: RecoveryRecord[];
}

export interface ApplicationMap {
  name: string;
  appUrl: string;
  workflow: string[];
  elements: Record<string, string>;
  pages: Record<string, PageMap>;
  discoveredAt: string;
}

export interface PageMap {
  name: string;
  url: string;
  elements: Record<string, ElementInfo>;
}

export interface ElementInfo {
  selector: string;
  type: string;
  label?: string;
  isClickable?: boolean;
}

export interface TestPlan {
  scenario: string;
  userStory: string;
  steps: TestStep[];
  applicationMapName: string;
  products?: string[];
  createdAt: string;
}

export interface TestStep {
  step: number;
  action: string;
  description: string;
  expectedResult?: string;
}

export interface ExecutionResults {
  scenario: string;
  passed: boolean;
  duration: number;
  startTime: string;
  endTime: string;
  browser: string;
  steps: StepResult[];
  screenshots: string[];
  traces: string[];
  videos: string[];
  logs: string[];
  error?: string;
  retryInfo: RetryInfo;
}

export interface StepResult {
  step: number;
  action: string;
  status: 'passed' | 'failed';
  duration: number;
  error?: string;
}

export interface RetryInfo {
  attempts: number;
  failures: FailureInfo[];
}

export interface FailureInfo {
  attempt: number;
  rootCause: FailureType;
  classification?: FailureClassification;
  healingStrategy?: string;
  timestamp: string;
}

export interface HealingRecord {
  attempt: number;
  rootCause: FailureType;
  fixApplied: string;
  affectedFile: string;
  affectedTest: string;
  timestamp: string;
  classification?: FailureClassification;
  fixSucceeded?: boolean;
  retryResult?: 'PASSED' | 'FAILED' | 'NOT_RUN';
  rootCauseExplanation?: string;
  suggestedAgents?: RecoveryAgent[];
  confidenceScore?: number;
  evidenceSummary?: string;
}

export type RecoveryAgent = 'Explorer' | 'Planner' | 'Generator' | 'Executor' | 'Healer';

export interface HealingDiagnostic {
  classification: FailureClassification;
  failureType: FailureType;
  rootCause: string;
  rootCauseExplanation: string;
  suggestedAgents: RecoveryAgent[];
  confidenceScore: number;
  evidenceSummary: string;
}

export type FailureType =
  | 'LOCATOR_FAILURE'
  | 'ASSERTION_FAILURE'
  | 'BUSINESS_LOGIC_FAILURE'
  | 'TIMEOUT_FAILURE'
  | 'NETWORK_FAILURE'
  | 'FLAKY_FAILURE'
  | 'UNKNOWN_FAILURE';

export type FailureClassification =
  | 'TEST_PLAN_FAILURE'
  | 'GENERATED_TEST_FAILURE'
  | 'PLAYWRIGHT_RUNTIME_FAILURE'
  | 'ENVIRONMENT_FAILURE'
  | 'UNKNOWN_INSUFFICIENT_EVIDENCE';

export interface IntentionalFailure {
  enabled: boolean;
  type?: 'EXPLORER_FAILURE' | 'PLANNER_FAILURE' | 'GENERATOR_FAILURE' | 'EXECUTOR_FAILURE' | 'INCORRECT_SELECTOR' | 'INCORRECT_ASSERTION' | 'MISSING_ACTION' | 'INCORRECT_NAVIGATION' | 'INCORRECT_TEST_DATA' | 'INCORRECT_INTERACTION' | 'RUNTIME_ISSUE' | 'OTHER';
  affectedAgent?: 'Explorer' | 'Planner' | 'Generator' | 'Executor' | 'Healer';
  injectedDefect?: string;
  reason?: string;
  recoveryRoute?: string[];
  target?: string;
  seed?: number;
  recordedAt?: string;
  injectedAtStage?: string;
  injectedFile?: string;
  injectedLine?: number;
}

export interface RecoveryRecord {
  stage: string;
  agent: string;
  action: 'INJECTED' | 'RECOVERY' | 'SKIPPED' | 'COMPLETED';
  route: string[];
  reason: string;
  timestamp: string;
}

export interface EvidenceChainEntry {
  requirement: string;
  plannerStep?: string;
  explorerEvidence?: string;
  generatedImplementation?: string;
  executionEvidence?: string;
  result: EvaluationResultStatus;
  justification: string;
}

export interface LLMConnectionStatus {
  connected: boolean;
  model: string;
  connectionTime: string;
  error?: string;
}

export interface MCPConnectionStatus {
  connected: boolean;
  connectionTime: string;
  error?: string;
}

export interface FinalReport {
  timestamp: string;
  systemConnectivity: SystemConnectivity;
  userStory: string;
  scenario: string;
  existingScenarioReused: boolean;
  applicationMap: ApplicationMap | null;
  testPlan?: TestPlan | null;
  actualWorkflow?: string[];
  plannerStatus: string;
  excelStatus: string;
  generatedFiles: string[];
  explorerDetails: ExplorerDetails;
  generatorDetails: GeneratorDetails;
  executorDetails: ExecutorDetails;
  healerDetails: HealerDetails;
  testResults: TestResultsSummary;
  retrySummary: RetrySummary;
  finalOutcome: 'SUCCESS' | 'FAILED';
  runId?: string;
  intentionalFailure?: IntentionalFailure;
  recoveryHistory?: RecoveryRecord[];
  evaluation?: EvaluationResult;
}

export type EvaluationResultStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_EVALUABLE';

export interface EvaluationCriterion {
  criterion: string;
  category?: string;
  weight?: number;
  expected: string;
  actual: string;
  whatWasEvaluated?: string;
  objective?: string;
  semanticMapping?: string;
  evidence: string;
  result: EvaluationResultStatus;
  reason: string;
  justification?: string;
  gaps?: string;
  impact?: string;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  defectAttribution?: string;
  recommendation?: string;
  scoreContribution?: number;
  scoreCalculation?: string;
  sourceOfTruth?: string;
  crossStageConsistency?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface EvaluationCategory {
  score: number;
  weight?: number;
  criteria: EvaluationCriterion[];
  explanation: string;
  evidence: string[];
}

export interface EvaluationResult {
  explorerAccuracy: EvaluationCategory;
  testPlanAccuracy: EvaluationCategory;
  generatedTestAccuracy: EvaluationCategory;
  executionAccuracy: EvaluationCategory;
  reportAccuracy: EvaluationCategory;
  overallScore: number;
  findings: EvaluationCriterion[];
  evidence: Record<string, string>;
  semanticJudgments: Record<string, EvaluationCriterion[]>;
  generatedAt: string;
}

export interface SystemConnectivity {
  llmStatus: LLMConnectionStatus;
}

export interface ExplorerDetails {
  started: boolean;
  connected: boolean;
  pagesExplored: number;
  workflowIdentified: string[];
  elementsDiscovered: number;
  startTime?: string;
  endTime?: string;
}

export interface GeneratorDetails {
  generatedNewTest: boolean;
  reuseExistingTest: boolean;
  testFile: string;
  createdAt?: string;
}

export interface ExecutorDetails {
  browserUsed: string;
  executionSteps: number;
  testDuration: number;
  artifactsPath: string;
}

export interface HealerDetails {
  triggered: boolean;
  rootCause?: FailureType;
  fixStrategy?: string;
  agentsInvoked: string[];
  iterations: number;
  filesUpdated: string[];
  healingAttempts: HealingRecord[];
}

export interface TestResultsSummary {
  passed: boolean;
  passedCount: number;
  failedCount: number;
  errorMessage?: string;
}

export interface RetrySummary {
  attempt1: 'passed' | 'failed';
  attempt2?: 'passed' | 'failed';
  attempt3?: 'passed' | 'failed';
  attempt4?: 'passed' | 'failed';
}

export interface ExcelRow {
  userStory: string;
  scenario: string;
  steps: string;
  applicationMapName: string;
  createdDate: string;
  executionCount: number;
  reuseCount: number;
}

export interface AgentMessage {
  agentName: string;
  action: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface ProgressEvent {
  type: 'status' | 'agent-start' | 'agent-end' | 'step-complete' | 'error';
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}
