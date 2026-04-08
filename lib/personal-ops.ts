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
  return {
    id: uid("job"),
    taskCardId: task.id,
    agent: "claude-api",
    status: task.complexity === "quick" ? "completed" : "waiting-on-user",
    followUpQuestions:
      task.complexity === "quick"
        ? []
        : [
            task.category === "finance"
              ? "Do you want to optimize for speed, savings, or lowest effort?"
              : "What outcome matters most so the agent can continue?",
          ],
    output:
      task.category === "splitcheck"
        ? "Drafted a payment reminder for your approval."
        : task.complexity === "quick"
          ? "Prepared a first-pass result for review."
          : "Started. One follow-up is needed before continuing.",
    startedAt: now,
    completedAt: task.complexity === "quick" ? now : undefined,
  };
}
