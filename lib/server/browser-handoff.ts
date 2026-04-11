import { TaskCard, TaxWorkflowPayload, WorkflowRun } from "@/lib/types";

export interface BrowserHandoffResponse {
  status: "prepared";
  target: "freetaxusa";
  goal: string;
  steps: string[];
  warnings: string[];
  readyForExecution: boolean;
}

export function buildBrowserHandoff(task: TaskCard, workflow: WorkflowRun): BrowserHandoffResponse {
  const payload = workflow.payload as TaxWorkflowPayload;

  return {
    status: "prepared",
    target: "freetaxusa",
    goal: `Prepare a supervised filing session for "${task.title}" inside FreeTaxUSA without final submission.`,
    steps: payload.browserHandoffPlan,
    warnings: payload.browserHandoffWarnings,
    readyForExecution: payload.sessionReady,
  };
}
