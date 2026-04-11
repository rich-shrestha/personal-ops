import { AgentJob, DraftTriage, TaskCard, TaskCategory, TaskComplexity } from "@/lib/types";

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function inferCategory(rawText: string): TaskCategory {
  const text = rawText.toLowerCase();
  if (text.includes("split") || text.includes("venmo") || text.includes("request money")) {
    return "splitcheck";
  }
  if (text.match(/bank|bill|subscription|budget|payment|refund|charge/)) return "finance";
  if (text.match(/doctor|gym|health|medication|therapy/)) return "health";
  if (text.match(/resume|job|portfolio|interview|application|outreach/)) return "career";
  if (text.match(/call|email|follow up|calendar|travel|errand|renew/)) return "admin";
  return "other";
}

export function inferComplexity(rawText: string): TaskComplexity {
  const text = rawText.toLowerCase();
  if (text.match(/research|compare|options|plan|figure out|investigate/)) return "research";
  if (text.match(/schedule|coordinate|multiple|follow up with|set up|renew/)) return "multi-step";
  return "quick";
}

export function summarize(rawText: string) {
  return rawText.trim().replace(/\s+/g, " ").split(".")[0].slice(0, 72);
}

export function buildDraft(rawText: string): DraftTriage {
  const category = inferCategory(rawText);
  const complexity = inferComplexity(rawText);
  return {
    title: summarize(rawText) || "Untitled",
    context: rawText.trim(),
    category,
    complexity,
    flaggedAsSplitcheck: category === "splitcheck",
  };
}

export function startHeuristicJob(task: TaskCard): AgentJob {
  const now = new Date().toISOString();
  const haystack = `${task.title} ${task.context}`.toLowerCase();
  const isTax = haystack.includes("tax") || haystack.includes("freetaxusa");
  const isRefinance =
    haystack.includes("refinance") || haystack.includes("loan") || haystack.includes("apr");
  const isDental = haystack.includes("dentist") || haystack.includes("dental");

  const followUpQuestion = isTax
    ? "Do you have any non-W-2 items like 1099 income, stock sales, or rental income?"
    : isRefinance
      ? "Do you want to optimize for lowest monthly payment, lowest total interest, or speed?"
      : isDental
        ? "Do you have dental insurance, and if so, which carrier or plan?"
        : task.category === "finance"
          ? "Do you want to optimize for speed, savings, or lowest effort?"
          : "What outcome matters most so the agent can continue?";

  const output = isTax
    ? "Prep list drafted: gather W-2s/1099s, last year's AGI, SSNs, bank info for refund/payment, and any deduction records before opening FreeTaxUSA."
    : isRefinance
      ? "Refinance plan drafted: confirm current APR and payoff amount, pull recent pay stubs, insurance, registration, and compare 3 lenders on APR, term, fees, and monthly payment."
      : isDental
        ? "Quote workflow drafted: contact 3 offices, ask for cash and insurance-adjusted pricing, confirm exam/x-ray inclusion, and log wait times, availability, and financing options."
        : task.category === "splitcheck"
          ? "Drafted a payment reminder for your approval."
          : task.complexity === "quick"
            ? "Prepared a first-pass result for review."
            : "Started. One follow-up is needed before continuing.";

  return {
    id: uid("job"),
    taskCardId: task.id,
    provider: "heuristic",
    agent: "claude-api",
    status: task.complexity === "quick" ? "completed" : "waiting-on-user",
    followUpQuestions: task.complexity === "quick" ? [] : [followUpQuestion],
    output,
    startedAt: now,
    completedAt: task.complexity === "quick" ? now : undefined,
  };
}
