import { TaskCard, TaxWorkflowPayload, WorkflowRun } from "@/lib/types";
import { uid } from "@/lib/personal-ops";

function containsTaxKeyword(text: string) {
  const haystack = text.toLowerCase();
  return haystack.includes("tax") || haystack.includes("freetaxusa");
}

export function isTaxTask(task: Pick<TaskCard, "title" | "context">) {
  return containsTaxKeyword(`${task.title} ${task.context}`);
}

export function buildFreeTaxUsaWorkflow(task: TaskCard): WorkflowRun {
  const now = new Date().toISOString();
  const payload: TaxWorkflowPayload = {
    provider: "freetaxusa",
    summary:
      "Prepare everything needed for a FreeTaxUSA filing session before attempting high-trust browser work.",
    blockers: [
      "Confirm whether all income forms have arrived before final filing.",
      "Have prior-year AGI or filing PIN ready for e-file signature.",
      "If you used Marketplace health insurance, have Form 1095-A ready.",
    ],
    nextAction: "Gather income forms and last year's AGI before opening the filing flow.",
    checklist: [
      {
        id: uid("check"),
        label: "Gather W-2s and core 1099 forms",
        detail: "Include W-2, 1099-INT, 1099-DIV, 1099-R, 1099-G, 1099-NEC, 1099-B, and any consolidated brokerage forms.",
        done: false,
      },
      {
        id: uid("check"),
        label: "Confirm special tax situations",
        detail: "Note self-employment, stock sales, crypto, rental property, K-1s, education credits, and dependents.",
        done: false,
      },
      {
        id: uid("check"),
        label: "Find prior-year AGI or filing PIN",
        detail: "FreeTaxUSA requires prior-year AGI or filing PIN as the electronic signature for e-file.",
        done: false,
      },
      {
        id: uid("check"),
        label: "Collect identity and payment details",
        detail: "Have SSNs, dependent details, bank routing/account info, and any amount owed or refund preference ready.",
        done: false,
      },
      {
        id: uid("check"),
        label: "Check health coverage forms",
        detail: "If Marketplace coverage applied, gather Form 1095-A before filing.",
        done: false,
      },
      {
        id: uid("check"),
        label: "Decide federal plus state filing plan",
        detail: "Federal return is free. State filing and Deluxe support may be separate decisions during checkout.",
        done: false,
      },
    ],
    notes: [
      "FreeTaxUSA supports major situations including self-employment, investments, rental property, and education forms.",
      "Do not submit until all expected forms are in hand and key identity details are verified.",
      "This workflow prepares the filing session; actual website entry/submission is a later high-trust execution step.",
    ],
  };

  return {
    id: uid("workflow"),
    taskCardId: task.id,
    workflowKey: "tax-freetaxusa",
    executionLevel: "prepare",
    status: "active",
    payload,
    createdAt: now,
    updatedAt: now,
  };
}
