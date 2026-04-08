import Anthropic from "@anthropic-ai/sdk";
import { buildDraft, startHeuristicJob, uid } from "@/lib/personal-ops";
import { AgentJob, AgentJobResult, DraftTriage, TaskCard, TriageResult } from "@/lib/types";
import { hasAnthropic } from "@/lib/server/env";

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in model output.");
  }

  return JSON.parse(match[0]) as Record<string, unknown>;
}

export async function triageCapture(rawText: string): Promise<TriageResult> {
  if (!hasAnthropic()) {
    return { draft: buildDraft(rawText), provider: "heuristic" };
  }

  try {
    const client = getAnthropicClient();
    if (!client) return { draft: buildDraft(rawText), provider: "heuristic" };

    const response = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 300,
      temperature: 0.2,
      system:
        "You triage personal productivity captures into compact task cards. Return JSON only.",
      messages: [
        {
          role: "user",
          content: `Triage this raw capture into JSON with keys: title, context, category, complexity, dueDate, flaggedAsSplitcheck.\nAllowed category: finance|health|career|admin|other|splitcheck.\nAllowed complexity: quick|research|multi-step.\nIf no due date is explicit, use null.\nRaw capture: ${rawText}`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(text);
    const fallback = buildDraft(rawText);
    const draft: DraftTriage = {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : fallback.title,
      context: typeof parsed.context === "string" && parsed.context.trim() ? parsed.context.trim() : fallback.context,
      category:
        parsed.category === "finance" ||
        parsed.category === "health" ||
        parsed.category === "career" ||
        parsed.category === "admin" ||
        parsed.category === "other" ||
        parsed.category === "splitcheck"
          ? parsed.category
          : fallback.category,
      complexity:
        parsed.complexity === "quick" ||
        parsed.complexity === "research" ||
        parsed.complexity === "multi-step"
          ? parsed.complexity
          : fallback.complexity,
      dueDate: typeof parsed.dueDate === "string" && parsed.dueDate ? parsed.dueDate : undefined,
      flaggedAsSplitcheck:
        typeof parsed.flaggedAsSplitcheck === "boolean"
          ? parsed.flaggedAsSplitcheck
          : fallback.flaggedAsSplitcheck,
    };

    return { draft, provider: "anthropic" };
  } catch {
    return { draft: buildDraft(rawText), provider: "heuristic" };
  }
}

export async function startAgentJob(task: TaskCard): Promise<AgentJobResult> {
  if (!hasAnthropic()) {
    return { job: startHeuristicJob(task), provider: "heuristic" };
  }

  try {
    const client = getAnthropicClient();
    if (!client) return { job: startHeuristicJob(task), provider: "heuristic" };

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 400,
      temperature: 0.4,
      system:
        "You are a personal ops task agent. Return JSON only. Produce a concise first-pass output and ask at most one follow-up question if needed.",
      messages: [
        {
          role: "user",
          content: `Start this task.\nTitle: ${task.title}\nCategory: ${task.category}\nComplexity: ${task.complexity}\nContext: ${task.context}\nReturn JSON with keys: output, followUpQuestions.\nfollowUpQuestions must be an array of strings with length 0 or 1.`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const parsed = extractJson(text);
    const followUpQuestions = Array.isArray(parsed.followUpQuestions)
      ? parsed.followUpQuestions.filter((item): item is string => typeof item === "string").slice(0, 1)
      : [];
    const now = new Date().toISOString();
    const job: AgentJob = {
      id: uid("job"),
      taskCardId: task.id,
      agent: "claude-api",
      status: followUpQuestions.length > 0 ? "waiting-on-user" : "completed",
      followUpQuestions,
      output:
        typeof parsed.output === "string" && parsed.output.trim()
          ? parsed.output.trim()
          : startHeuristicJob(task).output,
      startedAt: now,
      completedAt: followUpQuestions.length > 0 ? undefined : now,
    };

    return { job, provider: "anthropic" };
  } catch {
    return { job: startHeuristicJob(task), provider: "heuristic" };
  }
}

export async function continueAgentJob(job: AgentJob, answer: string): Promise<AgentJobResult> {
  if (!hasAnthropic()) {
    return {
      provider: "heuristic",
      job: {
        ...job,
        status: "completed",
        followUpQuestions: [],
        output: `${job.output} Follow-up received: ${answer.trim()}. Agent finished the next pass.`,
        completedAt: new Date().toISOString(),
      },
    };
  }

  try {
    const client = getAnthropicClient();
    if (!client) {
      throw new Error("Anthropic unavailable.");
    }

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 350,
      temperature: 0.3,
      system:
        "You are a personal ops agent continuing a task after a user follow-up. Return JSON only with one key: output.",
      messages: [
        {
          role: "user",
          content: `Existing output: ${job.output}\nOpen question: ${job.followUpQuestions.join(" ")}\nUser answer: ${answer}\nReturn JSON with key: output.`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const parsed = extractJson(text);

    return {
      provider: "anthropic",
      job: {
        ...job,
        status: "completed",
        followUpQuestions: [],
        output:
          typeof parsed.output === "string" && parsed.output.trim()
            ? parsed.output.trim()
            : `${job.output} Follow-up received. Agent finished the next pass.`,
        completedAt: new Date().toISOString(),
      },
    };
  } catch {
    return {
      provider: "heuristic",
      job: {
        ...job,
        status: "completed",
        followUpQuestions: [],
        output: `${job.output} Follow-up received: ${answer.trim()}. Agent finished the next pass.`,
        completedAt: new Date().toISOString(),
      },
    };
  }
}
