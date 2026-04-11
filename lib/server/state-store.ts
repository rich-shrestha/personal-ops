import { initialIdeas, initialJobs, initialTasks } from "@/lib/mock-data";
import { IdeaCard, Capture, AgentJob, TaskCard, WorkflowRun } from "@/lib/types";
import { getSupabaseServerClient, hasSupabaseServer } from "@/lib/server/supabase";

export interface PersistedAppState {
  captures: Capture[];
  tasks: TaskCard[];
  jobs: AgentJob[];
  ideas: IdeaCard[];
  workflows: WorkflowRun[];
  provider: "supabase" | "memory";
}

function seedState(): PersistedAppState {
  return {
    captures: [],
    tasks: initialTasks,
    jobs: initialJobs,
    ideas: initialIdeas,
    workflows: [],
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

    const [capturesRes, tasksRes, jobsRes, ideasRes, workflowsRes] = await Promise.all([
      supabase.from("captures").select("*").order("created_at", { ascending: false }),
      supabase.from("task_cards").select("*").order("updated_at", { ascending: false }),
      supabase.from("agent_jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("idea_cards").select("*").order("created_at", { ascending: false }),
      supabase.from("workflow_runs").select("*").order("updated_at", { ascending: false }),
    ]);

    if (capturesRes.error || tasksRes.error || jobsRes.error || ideasRes.error || workflowsRes.error) {
      return seedState();
    }

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
      category: row.category,
      complexity: row.complexity,
      status: row.status,
      dueDate: row.due_date ?? undefined,
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

    const workflows: WorkflowRun[] = (workflowsRes.data ?? []).map((row) => ({
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

    return {
      captures,
      tasks: tasks.length > 0 ? tasks : initialTasks,
      jobs,
      ideas,
      workflows,
      provider: "supabase",
    };
  } catch {
    return seedState();
  }
}

export async function saveAppState(state: Omit<PersistedAppState, "provider">) {
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
    const taskRows = state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      context: task.context,
      category: task.category,
      complexity: task.complexity,
      status: task.status,
      due_date: task.dueDate ?? null,
      source_capture_id: task.sourceCaptureId,
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

    const ops = [];
    if (captureRows.length) {
      ops.push(supabase.from("captures").upsert(captureRows));
    }
    if (taskRows.length) {
      ops.push(supabase.from("task_cards").upsert(taskRows));
    }
    if (jobRows.length) {
      ops.push(supabase.from("agent_jobs").upsert(jobRows));
    }
    if (ideaRows.length) {
      ops.push(supabase.from("idea_cards").upsert(ideaRows));
    }
    if (workflowRows.length) {
      ops.push(supabase.from("workflow_runs").upsert(workflowRows));
    }

    const results = await Promise.all(ops);
    if (results.some((result) => result.error)) {
      return { ok: false, provider: "memory" as const };
    }

    return { ok: true, provider: "supabase" as const };
  } catch {
    return { ok: false, provider: "memory" as const };
  }
}
