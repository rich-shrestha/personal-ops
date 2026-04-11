import { supabase } from "./supabase.js";
import { config } from "./config.js";
import { runFreeTaxUsaSession } from "./freetaxusa.js";
import { TaxWorkflowPayload, WorkflowRunRow } from "./types.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRequested(payload: unknown): payload is TaxWorkflowPayload {
  if (!payload || typeof payload !== "object") return false;
  return (
    "provider" in payload &&
    "browserHandoffStatus" in payload &&
    (payload as TaxWorkflowPayload).provider === "freetaxusa" &&
    (payload as TaxWorkflowPayload).browserHandoffStatus === "requested"
  );
}

async function fetchRequestedRuns() {
  const response = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("workflow_key", "tax-freetaxusa")
    .order("updated_at", { ascending: true })
    .limit(20);

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []).filter((row) => isRequested(row.payload)) as WorkflowRunRow[];
}

async function updatePayload(row: WorkflowRunRow, payload: TaxWorkflowPayload, status: WorkflowRunRow["status"]) {
  const { error } = await supabase
    .from("workflow_runs")
    .update({
      payload,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) throw error;
}

async function processRun(row: WorkflowRunRow) {
  const runningPayload: TaxWorkflowPayload = {
    ...row.payload,
    browserHandoffStatus: "running",
    browserExecutionUpdatedAt: new Date().toISOString(),
    browserExecutionLog: [...(row.payload.browserExecutionLog ?? []), "Worker accepted execution request."],
  };

  await updatePayload(row, runningPayload, row.status);

  try {
    const result = await runFreeTaxUsaSession(runningPayload);
    const completedPayload: TaxWorkflowPayload = {
      ...runningPayload,
      browserHandoffStatus: result.completed ? "complete" : "prepared",
      browserExecutionUpdatedAt: new Date().toISOString(),
      browserExecutionLog: [...(runningPayload.browserExecutionLog ?? []), ...result.log],
    };

    await updatePayload(row, completedPayload, row.status);
  } catch (error) {
    const failedPayload: TaxWorkflowPayload = {
      ...runningPayload,
      browserHandoffStatus: "failed",
      browserExecutionUpdatedAt: new Date().toISOString(),
      browserExecutionLog: [
        ...(runningPayload.browserExecutionLog ?? []),
        error instanceof Error ? error.message : "Unknown browser worker failure.",
      ],
    };

    await updatePayload(row, failedPayload, "blocked");
  }
}

async function main() {
  while (true) {
    try {
      const rows = await fetchRequestedRuns();
      const next = rows[0];
      if (next) {
        await processRun(next);
      }
    } catch (error) {
      console.error("browser-worker-error", error);
    }

    await sleep(config.pollIntervalMs);
  }
}

void main();
