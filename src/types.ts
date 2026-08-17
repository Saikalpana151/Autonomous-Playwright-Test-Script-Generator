// Core type definitions and interfaces for the AI Test Automation Agent

export interface ResolvedCredentials {
  username: string;
  password: string;
}

export interface ExecutionContext {
  userStory: string;
  scenario: string;
  applicationMap: ApplicationMap | null;
  testPlan: TestPlan | null;
  generatedTest: string | null;
  executionResults: ExecutionResults | null;
  retryCount: number;
  maxRetries: number;
  startTime: Date;
  endTime?: Date;
  healerInvoked?: boolean;
  resolvedCredentials: ResolvedCredentials;
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
  healingStrategy?: string;
  timestamp: string;
}

export type FailureType =
  | 'LOCATOR_FAILURE'
  | 'ASSERTION_FAILURE'
  | 'BUSINESS_LOGIC_FAILURE'
  | 'TIMEOUT_FAILURE'
  | 'NETWORK_FAILURE'
  | 'FLAKY_FAILURE'
  | 'UNKNOWN_FAILURE';

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
