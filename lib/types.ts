export type CaptureSource = "text" | "voice" | "splitcheck";
export type TaskCategory = "finance" | "health" | "career" | "admin" | "other" | "splitcheck";
export type TaskComplexity = "quick" | "research" | "multi-step";
export type TaskStatus =
  | "inbox"
  | "triaged"
  | "queued"
  | "in-progress"
  | "waiting-on-you"
  | "done";
export type JobStatus =
  | "pending-confirmation"
  | "running"
  | "waiting-on-user"
  | "completed"
  | "failed";

export interface Capture {
  id: string;
  rawText: string;
  createdAt: string;
  source: CaptureSource;
}

export interface TaskCard {
  id: string;
  title: string;
  context: string;
  category: TaskCategory;
  complexity: TaskComplexity;
  status: TaskStatus;
  dueDate?: string;
  sourceCaptureId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentJob {
  id: string;
  taskCardId: string;
  provider: "heuristic" | "anthropic" | "openai";
  agent: "claude-api";
  status: JobStatus;
  followUpQuestions: string[];
  output: string;
  startedAt?: string;
  completedAt?: string;
}

export interface IdeaCard {
  id: string;
  title: string;
  prompt: string;
  category: TaskCategory;
}

export interface DraftTriage {
  title: string;
  context: string;
  category: TaskCategory;
  complexity: TaskComplexity;
  dueDate?: string;
  flaggedAsSplitcheck: boolean;
}

export interface TriageResult {
  draft: DraftTriage;
  provider: "heuristic" | "anthropic" | "openai";
}

export interface AgentJobResult {
  job: AgentJob;
  provider: "heuristic" | "anthropic" | "openai";
}

export interface TranscriptionResult {
  text: string;
  provider: "browser" | "openai";
}

export type WorkflowExecutionLevel = "think" | "prepare" | "confirm-act" | "high-trust";
export type WorkflowRunStatus = "draft" | "active" | "blocked" | "ready" | "done";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  detail?: string;
}

export interface TaxWorkflowPayload {
  provider: "freetaxusa";
  summary: string;
  blockers: string[];
  nextAction: string;
  checklist: ChecklistItem[];
  notes: string[];
  filingStatus: "unknown" | "single" | "married-joint" | "married-separate" | "head-household";
  needsStateReturn: boolean;
  hasMarketplaceInsurance: boolean;
  priorYearSignatureReady: boolean;
  accountReady: boolean;
  sessionReady: boolean;
  sessionBrief: string[];
  sessionStatus: "idle" | "running" | "complete";
  currentStepIndex: number;
  sessionSteps: ChecklistItem[];
  browserHandoffStatus: "idle" | "prepared" | "requested";
  browserHandoffPlan: string[];
  browserHandoffWarnings: string[];
  browserHandoffPreparedAt?: string;
}

export interface WorkflowRun {
  id: string;
  taskCardId: string;
  workflowKey: string;
  executionLevel: WorkflowExecutionLevel;
  status: WorkflowRunStatus;
  payload: TaxWorkflowPayload | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
