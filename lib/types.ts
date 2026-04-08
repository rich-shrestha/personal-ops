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
  provider: "heuristic" | "anthropic";
}

export interface AgentJobResult {
  job: AgentJob;
  provider: "heuristic" | "anthropic";
}
