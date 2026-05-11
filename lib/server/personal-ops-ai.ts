import Anthropic from "@anthropic-ai/sdk";
import { buildDraft, startHeuristicJob, uid } from "@/lib/personal-ops";
import { AgentJob, AgentJobResult, DraftTriage, TaskCard, TaskComplexity, ThinkEntry, TriageResult } from "@/lib/types";
import { getTextProvider, hasAnthropic } from "@/lib/server/env";
import { getOpenAIClient, hasOpenAI } from "@/lib/server/openai";

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// ─── Rich's personal context ─────────────────────────────────────────────────
// Update this block whenever priorities shift. This goes into every agent call.
const RICH_CONTEXT = `
ABOUT RICH:
- Developer and entrepreneur. Main projects: SplitCheck (a bill-splitting app he built and is actively growing), a job application agent, and this personal ops system.
- Tech stack across projects: Next.js + Supabase + Claude API.
- Uses Claude Code as his primary build tool. Works fast and iteratively.
- Prefers async, autonomous workflows — wants things handled without babysitting them.

CURRENT PRIORITIES:
- [UPDATE: what's most important to Rich right now — e.g. "shipping SplitCheck v2", "landing a new role", "building savings"]
- [UPDATE: anything time-sensitive — e.g. "filing taxes by April 30", "following up on a job lead"]

LIFE CONTEXT:
- [UPDATE: city/location]
- [UPDATE: financial posture — e.g. "watching monthly spend, auditing subscriptions"]
- [UPDATE: health habits — e.g. "gym 3x/week, tracking sleep"]
- SplitCheck is his own app — any SplitCheck task is both a work and personal priority.

HOW TO RESPOND:
- Be direct. Assume Rich is busy. No preamble.
- Always end with one concrete next action, not a list of options.
- For research tasks, give a shortlist of what to look at, not a full breakdown.
- For SplitCheck tasks, treat them as product decisions that need clear recommendations.
- Never invent data, quotes, or rates. Flag when you need real numbers from Rich.
`.trim();

const personalOpsSystemContext = [
  RICH_CONTEXT,
  "This is a personal chief-of-staff system for capturing, triaging, and delegating life tasks.",
  "Optimize for clarity and concrete next actions over brainstorming.",
  "When triaging: prefer short action-first task titles (under 8 words), tight 1-2 sentence context, and accurate work vs personal classification.",
].join("\n\n");

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in model output.");
  }

  return JSON.parse(match[0]) as Record<string, unknown>;
}

function getWorkflowGuidance(task: Pick<TaskCard, "title" | "context" | "category">) {
  const haystack = `${task.title} ${task.context}`.toLowerCase();

  if (haystack.includes("freetaxusa") || haystack.includes("tax")) {
    return "Treat this as a tax-prep workflow. Prioritize missing documents, filing blockers, decision points, and the smallest concrete next steps. Do not claim to have filed anything.";
  }

  if (haystack.includes("refinance") || haystack.includes("loan") || haystack.includes("apr")) {
    return "Treat this as an auto-refinance workflow. Prioritize lender comparison criteria, required documents, refinance readiness, and a shortlist of concrete next actions. Do not invent rate quotes.";
  }

  if (haystack.includes("dentist") || haystack.includes("dental")) {
    return "Treat this as a dental quote workflow. Prioritize outreach scripts, insurance questions, pricing comparison factors, and the exact details the user should collect from each office.";
  }

  return "Focus on moving the task forward with the smallest credible next actions.";
}

export async function triageCapture(rawText: string): Promise<TriageResult> {
  const provider = getTextProvider();
  if (provider === "heuristic") {
    return { draft: buildDraft(rawText), provider: "heuristic" };
  }

  try {
    if (provider === "openai" && hasOpenAI()) {
      const client = getOpenAIClient();
      if (!client) return { draft: buildDraft(rawText), provider: "heuristic" };

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `${personalOpsSystemContext} You triage personal productivity captures into compact task cards. Return JSON only.`,
          },
          {
            role: "user",
            content: `Triage this raw capture into JSON with keys: title, context, area, category, complexity, effort, dueDate, flaggedAsSplitcheck.\nAllowed area: personal|work.\nAllowed category: finance|health|career|admin|other|splitcheck.\nAllowed complexity: quick|research|multi-step.\nAllowed effort: quick (< 15 min), medium (15-60 min), deep (1-3 hrs), project (multi-day).\nUse an action-first title under 8 words.\nMake context one or two tight sentences.\nIf no due date is explicit, use null.\nRaw capture: ${rawText}`,
          },
        ],
      });

      const text = response.output_text;
      const parsed = extractJson(text);
      const fallback = buildDraft(rawText);
      const draft: DraftTriage = {
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : fallback.title,
        context: typeof parsed.context === "string" && parsed.context.trim() ? parsed.context.trim() : fallback.context,
        area: parsed.area === "work" || parsed.area === "personal" ? parsed.area : fallback.area,
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
        effort:
          parsed.effort === "quick" || parsed.effort === "medium" || parsed.effort === "deep" || parsed.effort === "project"
            ? parsed.effort
            : undefined,
        dueDate: typeof parsed.dueDate === "string" && parsed.dueDate ? parsed.dueDate : undefined,
        flaggedAsSplitcheck:
          typeof parsed.flaggedAsSplitcheck === "boolean"
            ? parsed.flaggedAsSplitcheck
            : fallback.flaggedAsSplitcheck,
      };

      return { draft, provider: "openai" };
    }

    const client = getAnthropicClient();
    if (!client) return { draft: buildDraft(rawText), provider: "heuristic" };

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      temperature: 0.2,
      system: `${personalOpsSystemContext} You triage personal productivity captures into compact task cards. Return JSON only.`,
      messages: [
        {
          role: "user",
          content: `Triage this raw capture into JSON with keys: title, context, area, category, complexity, effort, dueDate, flaggedAsSplitcheck.\nAllowed area: personal|work.\nAllowed category: finance|health|career|admin|other|splitcheck.\nAllowed complexity: quick|research|multi-step.\nAllowed effort: quick (< 15 min), medium (15-60 min), deep (1-3 hrs), project (multi-day).\nUse an action-first title under 8 words.\nMake context one or two tight sentences.\nIf no due date is explicit, use null.\nRaw capture: ${rawText}`,
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
      area: parsed.area === "work" || parsed.area === "personal" ? parsed.area : fallback.area,
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
      effort:
        parsed.effort === "quick" || parsed.effort === "medium" || parsed.effort === "deep" || parsed.effort === "project"
          ? parsed.effort
          : undefined,
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
  const provider = getTextProvider();
  if (provider === "heuristic") {
    return { job: startHeuristicJob(task), provider: "heuristic" };
  }

  try {
    if (provider === "openai" && hasOpenAI()) {
      const client = getOpenAIClient();
      if (!client) return { job: startHeuristicJob(task), provider: "heuristic" };

      const response = await client.responses.create({
        model: "gpt-4.1",
        input: [
          {
            role: "system",
            content:
              `${personalOpsSystemContext} You are a personal ops task agent. Return JSON only.\n\nFor research tasks (e.g. "research cheaper Invisalign options", "compare loan rates", "find dentists"): do the actual research or reasoning from your training knowledge — give real findings, not just a plan to research. Structure output as: Goal → Findings (bulleted list of actual options/data) → Next steps.\n\nFor all tasks: always end your output with a "Next steps:" section containing 2-3 specific, actionable next steps the user can take today.\n\nAsk at most one follow-up question if you truly need information that would change the answer.`,
          },
          {
            role: "user",
            content: `Start this task.\nTitle: ${task.title}\nCategory: ${task.category}\nComplexity: ${task.complexity}\nEffort: ${task.effort ?? "unknown"}\nContext: ${task.context}\nReturn JSON with keys: output, followUpQuestions.\nfollowUpQuestions must be an array of strings with length 0 or 1.\nThe output field must end with "Next steps:" followed by 2-3 bullet points.`,
          },
        ],
      });

      const parsed = extractJson(response.output_text);
      const followUpQuestions = Array.isArray(parsed.followUpQuestions)
        ? parsed.followUpQuestions.filter((item): item is string => typeof item === "string").slice(0, 1)
        : [];
      const now = new Date().toISOString();

      return {
        provider: "openai",
        job: {
          id: uid("job"),
          taskCardId: task.id,
          provider: "openai",
          agent: "claude-api",
          status: followUpQuestions.length > 0 ? "waiting-on-user" : "completed",
          followUpQuestions,
          output:
            typeof parsed.output === "string" && parsed.output.trim()
              ? parsed.output.trim()
              : startHeuristicJob(task).output,
          startedAt: now,
          completedAt: followUpQuestions.length > 0 ? undefined : now,
        },
      };
    }

    const client = getAnthropicClient();
    if (!client) return { job: startHeuristicJob(task), provider: "heuristic" };

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      temperature: 0.4,
      system: `${personalOpsSystemContext} You are a personal ops task agent. Return JSON only.\n\nFor research tasks (e.g. "research cheaper Invisalign options", "compare loan rates", "find dentists"): do the actual research or reasoning from your training knowledge — give real findings, not just a plan to research. Structure output as: Goal → Findings (bulleted list of actual options/data) → Next steps.\n\nFor all tasks: always end your output with a "Next steps:" section containing 2-3 specific, actionable next steps the user can take today.\n\nAsk at most one follow-up question if you truly need information that would change the answer. ${getWorkflowGuidance(task)}`,
      messages: [
        {
          role: "user",
          content: `Start this task.\nTitle: ${task.title}\nCategory: ${task.category}\nComplexity: ${task.complexity}\nEffort: ${task.effort ?? "unknown"}\nContext: ${task.context}\nReturn JSON with keys: output, followUpQuestions.\nfollowUpQuestions must be an array of strings with length 0 or 1.\nThe output field must end with "Next steps:" followed by 2-3 bullet points.`,
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
      provider: "anthropic",
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
  const provider = getTextProvider();
  if (provider === "heuristic") {
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
    if (provider === "openai" && hasOpenAI()) {
      const client = getOpenAIClient();
      if (!client) {
        throw new Error("OpenAI unavailable.");
      }

      const response = await client.responses.create({
        model: "gpt-4.1",
        input: [
          {
            role: "system",
            content:
              "You are a personal ops agent continuing a task after a user follow-up. Return JSON only with one key: output. The output must end with a 'Next steps:' section containing 2-3 concrete, actionable bullet points.",
          },
          {
            role: "user",
            content: `Existing output: ${job.output}\nOpen question: ${job.followUpQuestions.join(" ")}\nUser answer: ${answer}\nReturn JSON with key: output. The output must end with "Next steps:" and 2-3 bullet points.`,
          },
        ],
      });
      const parsed = extractJson(response.output_text);

      return {
        provider: "openai",
        job: {
          ...job,
          provider: "openai",
          status: "completed",
          followUpQuestions: [],
          output:
            typeof parsed.output === "string" && parsed.output.trim()
              ? parsed.output.trim()
              : `${job.output} Follow-up received. Agent finished the next pass.`,
          completedAt: new Date().toISOString(),
        },
      };
    }

    const client = getAnthropicClient();
    if (!client) {
      throw new Error("Anthropic unavailable.");
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
      temperature: 0.3,
      system:
        "You are a personal ops agent continuing a task after a user follow-up. Return JSON only with one key: output. The output must end with a 'Next steps:' section containing 2-3 concrete, actionable bullet points.",
      messages: [
        {
          role: "user",
          content: `Existing output: ${job.output}\nOpen question: ${job.followUpQuestions.join(" ")}\nUser answer: ${answer}\nReturn JSON with key: output. The output must end with "Next steps:" and 2-3 bullet points.`,
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
        provider: "anthropic",
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
        provider: "heuristic",
        status: "completed",
        followUpQuestions: [],
        output: `${job.output} Follow-up received: ${answer.trim()}. Agent finished the next pass.`,
        completedAt: new Date().toISOString(),
      },
    };
  }
}

export interface ThinkEntryResult {
  entry: ThinkEntry;
  provider: "heuristic" | "anthropic" | "openai";
}

function buildHeuristicThinkEntry(text: string, area: ThinkEntry["area"]): ThinkEntry {
  return {
    id: uid("think"),
    text,
    claudeResponse: "Logged. No AI provider available — tasks must be added manually.",
    extractedTasks: [],
    confirmedTaskIds: [],
    area,
    createdAt: new Date().toISOString(),
  };
}

export async function processThinkEntry(
  text: string,
  area: ThinkEntry["area"],
): Promise<ThinkEntryResult> {
  const provider = getTextProvider();

  if (provider === "heuristic") {
    return { entry: buildHeuristicThinkEntry(text, area), provider: "heuristic" };
  }

  const systemPrompt = [
    personalOpsSystemContext,
    "You are a personal ops thought partner. The user is sharing what is on their mind.",
    "Your job: respond conversationally AND extract any actionable items as tasks.",
    "Return JSON only with two keys:",
    '  "response": string — a direct, helpful reply (1-3 sentences max). No preamble.',
    '  "tasks": array of { title: string, context: string, complexity: "quick" | "research" | "multi-step" }',
    "tasks must be ranked by ascending time-to-complete (quick first).",
    "If nothing is actionable, tasks must be an empty array.",
    "Title must be action-first, under 8 words.",
    "Context must be 1-2 tight sentences.",
  ].join("\n");

  const userMessage = `Here is what is on my mind:\n\n${text}`;

  try {
    if (provider === "openai" && hasOpenAI()) {
      const client = getOpenAIClient();
      if (!client) return { entry: buildHeuristicThinkEntry(text, area), provider: "heuristic" };

      const response = await client.responses.create({
        model: "gpt-4.1",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const parsed = extractJson(response.output_text);
      return {
        provider: "openai",
        entry: {
          id: uid("think"),
          text,
          claudeResponse: typeof parsed.response === "string" ? parsed.response.trim() : "Logged.",
          extractedTasks: Array.isArray(parsed.tasks)
            ? (parsed.tasks as Array<{ title: string; context: string; complexity: string }>)
                .filter(
                  (t) =>
                    typeof t.title === "string" &&
                    typeof t.context === "string" &&
                    (t.complexity === "quick" || t.complexity === "research" || t.complexity === "multi-step"),
                )
                .map((t) => ({
                  title: t.title.trim(),
                  context: t.context.trim(),
                  complexity: t.complexity as TaskComplexity,
                }))
            : [],
          confirmedTaskIds: [],
          area,
          createdAt: new Date().toISOString(),
        },
      };
    }

    const client = getAnthropicClient();
    if (!client) return { entry: buildHeuristicThinkEntry(text, area), provider: "heuristic" };

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(raw);

    return {
      provider: "anthropic",
      entry: {
        id: uid("think"),
        text,
        claudeResponse: typeof parsed.response === "string" ? parsed.response.trim() : "Logged.",
        extractedTasks: Array.isArray(parsed.tasks)
          ? (parsed.tasks as Array<{ title: string; context: string; complexity: string }>)
              .filter(
                (t) =>
                  typeof t.title === "string" &&
                  typeof t.context === "string" &&
                  (t.complexity === "quick" || t.complexity === "research" || t.complexity === "multi-step"),
              )
              .map((t) => ({
                title: t.title.trim(),
                context: t.context.trim(),
                complexity: t.complexity as TaskComplexity,
              }))
          : [],
        confirmedTaskIds: [],
        area,
        createdAt: new Date().toISOString(),
      },
    };
  } catch {
    return { entry: buildHeuristicThinkEntry(text, area), provider: "heuristic" };
  }
}
