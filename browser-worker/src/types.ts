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
  browserHandoffStatus: "idle" | "prepared" | "requested" | "running" | "complete" | "failed";
  browserHandoffPlan: string[];
  browserHandoffWarnings: string[];
  browserHandoffPreparedAt?: string;
  browserExecutionLog?: string[];
  browserExecutionUpdatedAt?: string;
}

export interface WorkflowRunRow {
  id: string;
  task_card_id: string | null;
  workflow_key: string;
  execution_level: "think" | "prepare" | "confirm-act" | "high-trust";
  status: "draft" | "active" | "blocked" | "ready" | "done";
  payload: TaxWorkflowPayload;
  created_at: string;
  updated_at: string;
}
