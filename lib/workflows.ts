import { TaskCard, TaxWorkflowPayload, WorkflowRun } from "@/lib/types";
import { uid } from "@/lib/personal-ops";

function containsTaxKeyword(text: string) {
  const haystack = text.toLowerCase();
  return haystack.includes("tax") || haystack.includes("freetaxusa");
}

export function isTaxTask(task: Pick<TaskCard, "title" | "context">) {
  return containsTaxKeyword(`${task.title} ${task.context}`);
}

function buildSessionBrief(payload: TaxWorkflowPayload) {
  const lines = [
    "Open or log into FreeTaxUSA only after the checklist items below are ready.",
    payload.priorYearSignatureReady
      ? "Prior-year AGI or e-file PIN is ready for the e-file signature step."
      : "Find prior-year AGI or e-file PIN before the final e-file step.",
    payload.hasMarketplaceInsurance
      ? "Expect to enter Form 1095-A details and reconcile Premium Tax Credit information."
      : "No Marketplace insurance flagged so far.",
    payload.needsStateReturn
      ? "Plan for the paid state return flow after federal review."
      : "You can likely stay federal-only unless a state filing becomes necessary.",
    payload.accountReady
      ? "FreeTaxUSA account access is ready."
      : "Confirm account access or create an account before the filing session.",
  ];

  if (payload.filingStatus !== "unknown") {
    lines.push(`Current filing status assumption: ${payload.filingStatus}.`);
  }

  return lines;
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
        detail: "Federal return is free. State filing is currently $15.99 and Deluxe support is optional.",
        done: false,
      },
    ],
    notes: [
      "FreeTaxUSA supports major situations including self-employment, investments, rental property, and education forms.",
      "Free federal filing is free. State return filing is currently $15.99 and Deluxe support is currently $7.99.",
      "This workflow prepares the filing session; actual website entry/submission is a later high-trust execution step.",
    ],
    filingStatus: "unknown",
    needsStateReturn: false,
    hasMarketplaceInsurance: false,
    priorYearSignatureReady: false,
    accountReady: false,
    sessionReady: false,
    sessionBrief: [],
  };

  const normalized = normalizeTaxWorkflowPayload(payload);

  return {
    id: uid("workflow"),
    taskCardId: task.id,
    workflowKey: "tax-freetaxusa",
    executionLevel: normalized.sessionReady ? "high-trust" : "prepare",
    status: normalized.sessionReady ? "ready" : "active",
    payload: normalized,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTaxWorkflowPayload(payload: TaxWorkflowPayload): TaxWorkflowPayload {
  const checklistComplete = payload.checklist.every((item) => item.done);
  const blockers: string[] = [];

  if (!checklistComplete) {
    blockers.push("Finish the prep checklist before starting the filing session.");
  }
  if (!payload.priorYearSignatureReady) {
    blockers.push("Find prior-year AGI or your prior-year e-file PIN for the e-file signature step.");
  }
  if (payload.hasMarketplaceInsurance) {
    const hasHealthForm = payload.checklist.some(
      (item) => item.label === "Check health coverage forms" && item.done,
    );
    if (!hasHealthForm) {
      blockers.push("Gather Form 1095-A before going through the health insurance section.");
    }
  }
  if (!payload.accountReady) {
    blockers.push("Confirm you can log into FreeTaxUSA or create the account before the filing session.");
  }
  if (payload.filingStatus === "unknown") {
    blockers.push("Choose the expected filing status before starting the filing interview.");
  }

  const sessionReady = blockers.length === 0;
  const nextAction = sessionReady
    ? "Ready for a supervised FreeTaxUSA filing session."
    : blockers[0];

  return {
    ...payload,
    blockers,
    nextAction,
    sessionReady,
    sessionBrief: buildSessionBrief(payload),
  };
}

export function toggleTaxChecklistItem(workflow: WorkflowRun, itemId: string): WorkflowRun {
  const payload = workflow.payload as TaxWorkflowPayload;
  const nextPayload = normalizeTaxWorkflowPayload({
    ...payload,
    checklist: payload.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    ),
  });

  return {
    ...workflow,
    executionLevel: nextPayload.sessionReady ? "high-trust" : "prepare",
    status: nextPayload.sessionReady ? "ready" : "active",
    payload: nextPayload,
    updatedAt: new Date().toISOString(),
  };
}

export function updateTaxWorkflowFields(
  workflow: WorkflowRun,
  patch: Partial<
    Pick<
      TaxWorkflowPayload,
      "filingStatus" | "needsStateReturn" | "hasMarketplaceInsurance" | "priorYearSignatureReady" | "accountReady"
    >
  >,
): WorkflowRun {
  const payload = workflow.payload as TaxWorkflowPayload;
  const nextPayload = normalizeTaxWorkflowPayload({
    ...payload,
    ...patch,
  });

  return {
    ...workflow,
    executionLevel: nextPayload.sessionReady ? "high-trust" : "prepare",
    status: nextPayload.sessionReady ? "ready" : "active",
    payload: nextPayload,
    updatedAt: new Date().toISOString(),
  };
}
