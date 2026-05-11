import { initialIdeas, initialJobs, initialTasks } from "@/lib/mock-data";
import { IdeaCard, Capture, AgentJob, TaskCard, WorkflowRun, ThinkEntry } from "@/lib/types";

const VALID_HORIZONS = new Set<string>(["today", "weekend", "this-week", "someday"]);
import { getSupabaseServerClient, hasSupabaseServer } from "@/lib/server/supabase";

export interface PersistedAppState {
  captures: Capture[];
  tasks: TaskCard[];
  jobs: AgentJob[];
  ideas: IdeaCard[];
  workflows: WorkflowRun[];
  thinkEntries: ThinkEntry[];
  provider: "supabase" | "memory";
}

interface AppStateWorkflowPayload {
  taskMetadata?: Record<
    string,
    {
      area?: TaskCard["area"];
      archivedAt?: string;
    }
  >;
}

function seedState(): PersistedAppState {
  return {
    captures: [],
    tasks: initialTasks,
    jobs: initialJobs,
    ideas: initialIdeas,
    workflows: [],
    thinkEntries: [],
    provider: "memory",
  };
}

export async function loadAppState(): Promise<PersistedAppState> {
  if (!hasSupabaseServer()) {
    return seedState();
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return seedState();

    const [capturesRes, tasksRes, jobsRes, ideasRes, workflowsRes, thinkEntriesRes] = await Promise.all([
      supabase.from("captures").select("*").order("created_at", { ascending: false }),
      supabase.from("task_cards").select("*").order("updated_at", { ascending: false }),
      supabase.from("agent_jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("idea_cards").select("*").order("created_at", { ascending: false }),
      supabase.from("workflow_runs").select("*").order("updated_at", { ascending: false }),
      supabase.from("think_entries").select("*").order("created_at", { ascending: false }),
    ]);

    if (capturesRes.error || tasksRes.error || jobsRes.error || ideasRes.error || workflowsRes.error) {
      return seedState();
    }

    // think_entries is optional — if the table doesn't exist yet, just use []
    const thinkEntries: ThinkEntry[] = thinkEntriesRes.error
      ? []
      : (thinkEntriesRes.data ?? []).map((row) => ({
          id: row.id as string,
          text: row.text as string,
          claudeResponse: (row.claude_response as string) ?? "",
          extractedTasks: Array.isArray(row.extracted_tasks) ? (row.extracted_tasks as ThinkEntry["extractedTasks"]) : [],
          confirmedTaskIds: Array.isArray(row.confirmed_task_ids) ? (row.confirmed_task_ids as string[]) : [],
          area: row.area === "work" || row.area === "personal" ? (row.area as ThinkEntry["area"]) : "all",
          createdAt: row.created_at as string,
        }));

    const captures: Capture[] = (capturesRes.data ?? []).map((row) => ({
      id: row.id,
      rawText: row.raw_text,
      source: row.source,
      createdAt: row.created_at,
    }));

    const tasks: TaskCard[] = (tasksRes.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      context: row.context,
      area: row.area === "work" ? "work" : "personal",
      category: row.category,
      complexity: row.complexity,
      status: row.status,
      archivedAt: row.archived_at ?? undefined,
      dueDate: row.due_date ?? undefined,
      notes: row.notes ?? undefined,
      sortOrder: typeof row.sort_order === "number" ? row.sort_order : undefined,
      effort:
        row.effort === "quick" || row.effort === "medium" || row.effort === "deep" || row.effort === "project"
          ? (row.effort as TaskCard["effort"])
          : undefined,
      horizon: VALID_HORIZONS.has(row.horizon as string)
        ? (row.horizon as TaskCard["horizon"])
        : undefined,
      scheduledTime: typeof row.scheduled_time === "string" ? row.scheduled_time : undefined,
      sourceCaptureId: row.source_capture_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const jobs: AgentJob[] = (jobsRes.data ?? []).map((row) => ({
      id: row.id,
      taskCardId: row.task_card_id,
      provider: row.provider === "anthropic" || row.provider === "openai" ? row.provider : "heuristic",
      agent: row.agent,
      status: row.status,
      followUpQuestions: Array.isArray(row.follow_up_questions) ? row.follow_up_questions : [],
      output: row.output,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    }));

    const ideas: IdeaCard[] =
      (ideasRes.data ?? []).length > 0
        ? (ideasRes.data ?? []).map((row) => ({
            id: row.id,
            title: row.title,
            prompt: row.prompt,
            category: row.category,
          }))
        : initialIdeas;

    const appStateWorkflow = (workflowsRes.data ?? []).find((row) => row.workflow_key === "app-state");
    const appStatePayload =
      appStateWorkflow?.payload && typeof appStateWorkflow.payload === "object"
        ? (appStateWorkflow.payload as AppStateWorkflowPayload)
        : {};
    const taskMetadata = appStatePayload.taskMetadata ?? {};

    const workflows: WorkflowRun[] = (workflowsRes.data ?? [])
      .filter((row) => row.workflow_key !== "app-state")
      .map((row) => ({
      id: row.id,
      taskCardId: row.task_card_id,
      workflowKey: row.workflow_key,
      executionLevel: row.execution_level,
      status: row.status,
      payload:
        row.payload && typeof row.payload === "object"
          ? (row.payload as WorkflowRun["payload"])
          : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const hydratedTasks = tasks.map((task) => {
      const metadata = taskMetadata[task.id];
      return {
        ...task,
        area: metadata?.area ?? task.area,
        archivedAt: metadata?.archivedAt ?? task.archivedAt,
      };
    });

    return {
      captures,
      tasks: hydratedTasks.length > 0 ? hydratedTasks : initialTasks,
      jobs,
      ideas,
      workflows,
      thinkEntries,
      provider: "supabase",
    };
  } catch {
    return seedState();
  }
}

export async function saveAppState(state: Omit<PersistedAppState, "provider"> & { thinkEntries?: ThinkEntry[] }) {
  if (!hasSupabaseServer()) {
    return { ok: true, provider: "memory" as const };
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return { ok: true, provider: "memory" as const };

    const captureRows = state.captures.map((capture) => ({
      id: capture.id,
      raw_text: capture.rawText,
      source: capture.source,
      created_at: capture.createdAt,
    }));

    // Only reference a capture id if it's actually being saved — avoids FK violation
    // when seed/mock tasks reference captures that don't exist in the DB yet.
    const captureIdSet = new Set(state.captures.map((c) => c.id));

    const taskRows = state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      context: task.context,
      area: task.area,
      category: task.category,
      complexity: task.complexity,
      status: task.status,
      archived_at: task.archivedAt ?? null,
      due_date: task.dueDate ?? null,
      notes: task.notes ?? null,
      sort_order: task.sortOrder ?? null,
      effort: task.effort ?? null,
      horizon: task.horizon ?? null,
      scheduled_time: task.scheduledTime ?? null,
      source_capture_id: captureIdSet.has(task.sourceCaptureId) ? task.sourceCaptureId : null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    }));
    const legacyTaskRows = state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      context: task.context,
      category: task.category,
      complexity: task.complexity,
      status: task.status,
      due_date: task.dueDate ?? null,
      source_capture_id: captureIdSet.has(task.sourceCaptureId) ? task.sourceCaptureId : null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    }));
    const jobRows = state.jobs.map((job) => ({
      id: job.id,
      task_card_id: job.taskCardId,
      provider: job.provider,
      agent: job.agent,
      status: job.status,
      follow_up_questions: job.followUpQuestions,
      output: job.output,
      started_at: job.startedAt ?? null,
      completed_at: job.completedAt ?? null,
    }));
    const ideaRows = state.ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      prompt: idea.prompt,
      category: idea.category,
    }));
    const workflowRows = state.workflows.map((workflow) => ({
      id: workflow.id,
      task_card_id: workflow.taskCardId,
      workflow_key: workflow.workflowKey,
      execution_level: workflow.executionLevel,
      status: workflow.status,
      payload: workflow.payload,
      created_at: workflow.createdAt,
      updated_at: workflow.updatedAt,
    }));
    const appStateWorkflowRow = {
      id: "workflow-app-state",
      task_card_id: null,
      workflow_key: "app-state",
      execution_level: "think",
      status: "active",
      payload: {
        taskMetadata: Object.fromEntries(
          state.tasks.map((task) => [
            task.id,
            {
              area: task.area,
              archivedAt: task.archivedAt,
            },
          ]),
        ),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const thinkEntryRows = (state.thinkEntries ?? []).map((entry) => ({
      id: entry.id,
      text: entry.text,
      claude_response: entry.claudeResponse,
      extracted_tasks: entry.extractedTasks,
      confirmed_task_ids: entry.confirmedTaskIds,
      area: entry.area,
      created_at: entry.createdAt,
    }));

    const syncTable = async (
      table: "captures" | "task_cards" | "agent_jobs" | "idea_cards" | "workflow_runs" | "think_entries",
      rows: Record<string, unknown>[],
    ) => {
      const existingRes = await supabase.from(table).select("id");
      if (existingRes.error) return existingRes;

      if (rows.length > 0) {
        const upsertRes = await supabase.from(table).upsert(rows);
        if (upsertRes.error) return upsertRes;
      }

      const existingIds = new Set((existingRes.data ?? []).map((row) => row.id as string));
      const nextIds = new Set(rows.map((row) => row.id as string));
      const staleIds = [...existingIds].filter((id) => !nextIds.has(id));

      if (staleIds.length > 0) {
        const deleteRes = await supabase.from(table).delete().in("id", staleIds);
        if (deleteRes.error) return deleteRes;
      }

      return { error: null };
    };

    // Captures must be saved before tasks (FK: task_cards.source_capture_id → captures.id)
    // Tasks must be saved before agent_jobs (FK: agent_jobs.task_card_id → task_cards.id)
    const capturesSyncResult = await syncTable("captures", captureRows);
    if (capturesSyncResult.error) {
      console.error("[state-store] captures sync failed:", capturesSyncResult.error);
      return { ok: false, provider: "memory" as const };
    }

    const taskSyncResult = await syncTable("task_cards", taskRows);
    const taskSchemaMissing =
      Boolean(taskSyncResult.error) &&
      /column .*area|column .*archived_at/i.test(String(taskSyncResult.error?.message ?? ""));

    const taskFinalResult = taskSchemaMissing
      ? await syncTable("task_cards", legacyTaskRows)
      : taskSyncResult;
    if (taskFinalResult.error) {
      console.error("[state-store] task_cards sync failed:", taskFinalResult.error);
      return { ok: false, provider: "memory" as const };
    }

    const [jobsResult, ideasResult, workflowsResult] = await Promise.all([
      syncTable("agent_jobs", jobRows),
      syncTable("idea_cards", ideaRows),
      syncTable("workflow_runs", [...workflowRows, appStateWorkflowRow]),
    ]);
    if (jobsResult.error) console.error("[state-store] agent_jobs sync failed:", jobsResult.error);
    if (ideasResult.error) console.error("[state-store] idea_cards sync failed:", ideasResult.error);
    if (workflowsResult.error) console.error("[state-store] workflow_runs sync failed:", workflowsResult.error);
    if (jobsResult.error || ideasResult.error || workflowsResult.error) {
      return { ok: false, provider: "memory" as const };
    }

    // think_entries is optional — don't fail the whole save if the table doesn't exist yet
    const thinkResult = await syncTable("think_entries", thinkEntryRows);
    if (thinkResult.error) {
      console.error("[state-store] think_entries sync failed (non-fatal):", thinkResult.error);
    }

    return { ok: true, provider: "supabase" as const };
  } catch (err) {
    console.error("[state-store] saveAppState threw:", err);
    return { ok: false, provider: "memory" as const };
  }
}
