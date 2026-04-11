import { ChecklistItem, TaskCard, TaxWorkflowPayload, WorkflowRun } from "@/lib/types";
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

function buildSessionSteps(payload: Pick<TaxWorkflowPayload, "hasMarketplaceInsurance" | "needsStateReturn">) {
  const steps: ChecklistItem[] = [
    {
      id: uid("session"),
      label: "Open FreeTaxUSA and start or resume the current year return",
      detail: "Log in or create the account, then confirm you are in the correct tax year.",
      done: false,
    },
    {
      id: uid("session"),
      label: "Enter identity and filing status details",
      detail: "Walk through the personal information screens and choose the filing status you already set here.",
      done: false,
    },
    {
      id: uid("session"),
      label: "Enter income documents",
      detail: "Use the W-2 and 1099 documents you gathered. Pause if any expected form is still missing.",
      done: false,
    },
    {
      id: uid("session"),
      label: "Review deductions, credits, and special situations",
      detail: "Cover education, dependents, self-employment, investments, rental property, and other flagged topics.",
      done: false,
    },
  ];

  if (payload.hasMarketplaceInsurance) {
    steps.push({
      id: uid("session"),
      label: "Enter Marketplace coverage details",
      detail: "Use Form 1095-A and confirm the Premium Tax Credit reconciliation screens are complete.",
      done: false,
    });
  }

  steps.push({
    id: uid("session"),
    label: "Run federal review and prepare e-file signature",
    detail: "Use prior-year AGI or prior-year e-file PIN when the final e-file signature screen appears.",
    done: false,
  });

  if (payload.needsStateReturn) {
    steps.push({
      id: uid("session"),
      label: "Complete the state return flow",
      detail: "Move into the paid state return flow after federal review if a state filing is needed.",
      done: false,
    });
  }

  steps.push({
    id: uid("session"),
    label: "Final check before submission",
    detail: "Confirm refund/payment details, optional add-ons, and only then decide whether to submit.",
    done: false,
  });

  return steps;
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
    sessionStatus: "idle",
    currentStepIndex: 0,
    sessionSteps: [],
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
    sessionSteps:
      payload.sessionStatus === "idle"
        ? buildSessionSteps(payload)
        : payload.sessionSteps.length > 0
          ? payload.sessionSteps
          : buildSessionSteps(payload),
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

export function startTaxFilingSession(workflow: WorkflowRun): WorkflowRun {
  const payload = workflow.payload as TaxWorkflowPayload;
  const nextPayload = normalizeTaxWorkflowPayload({
    ...payload,
    sessionStatus: "running",
    currentStepIndex: 0,
    sessionSteps: buildSessionSteps(payload),
  });

  return {
    ...workflow,
    executionLevel: "high-trust",
    status: nextPayload.sessionReady ? "ready" : "blocked",
    payload: nextPayload,
    updatedAt: new Date().toISOString(),
  };
}

export function advanceTaxSessionStep(workflow: WorkflowRun): WorkflowRun {
  const payload = workflow.payload as TaxWorkflowPayload;
  const sessionSteps = payload.sessionSteps.map((step, index) =>
    index === payload.currentStepIndex ? { ...step, done: true } : step,
  );
  const nextIndex = Math.min(payload.currentStepIndex + 1, Math.max(sessionSteps.length - 1, 0));
  const complete = sessionSteps.every((step) => step.done);
  const nextPayload = normalizeTaxWorkflowPayload({
    ...payload,
    sessionStatus: complete ? "complete" : "running",
    currentStepIndex: complete ? nextIndex : nextIndex,
    sessionSteps,
  });

  return {
    ...workflow,
    executionLevel: "high-trust",
    status: complete ? "done" : nextPayload.sessionReady ? "ready" : "blocked",
    payload: nextPayload,
    updatedAt: new Date().toISOString(),
  };
}

export function resetTaxSession(workflow: WorkflowRun): WorkflowRun {
  const payload = workflow.payload as TaxWorkflowPayload;
  const nextPayload = normalizeTaxWorkflowPayload({
    ...payload,
    sessionStatus: "idle",
    currentStepIndex: 0,
    sessionSteps: buildSessionSteps(payload),
  });

  return {
    ...workflow,
    executionLevel: nextPayload.sessionReady ? "high-trust" : "prepare",
    status: nextPayload.sessionReady ? "ready" : "active",
    payload: nextPayload,
    updatedAt: new Date().toISOString(),
  };
}
