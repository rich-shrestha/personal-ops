"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { initialIdeas, initialJobs, initialTasks } from "@/lib/mock-data";
import { buildDraft, startHeuristicJob, uid } from "@/lib/personal-ops";
import {
  AgentJob,
  AgentJobResult,
  Capture,
  DraftTriage,
  IdeaCard,
  TaskCard,
  TaskCategory,
  TaskComplexity,
  TaskStatus,
  TriageResult,
  WorkflowRun,
  TaxWorkflowPayload,
} from "@/lib/types";
import {
  buildFreeTaxUsaWorkflow,
  isTaxTask,
  toggleTaxChecklistItem,
  updateTaxWorkflowFields,
} from "@/lib/workflows";

const storageKey = "personal-ops-state-v1";

interface PersistedState {
  captures: Capture[];
  tasks: TaskCard[];
  jobs: AgentJob[];
  ideas: IdeaCard[];
  workflows: WorkflowRun[];
}

interface StateResponse extends PersistedState {
  provider?: "supabase" | "memory";
}

function readLocalState(): PersistedState | null {
  if (typeof window === "undefined") return null;

  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as PersistedState;
    return {
      captures: parsed.captures ?? [],
      tasks: applyAutoQueue(parsed.tasks ?? []),
      jobs: (parsed.jobs ?? []).map((job) => ({
        ...job,
        provider:
          job.provider === "anthropic" || job.provider === "openai"
            ? job.provider
            : "heuristic",
      })),
      ideas: parsed.ideas ?? [],
      workflows: parsed.workflows ?? [],
    };
  } catch {
    return null;
  }
}

function withAutoWorkflows(state: PersistedState): PersistedState {
  const existingTaxTaskIds = new Set(
    state.workflows
      .filter((workflow) => workflow.workflowKey === "tax-freetaxusa")
      .map((workflow) => workflow.taskCardId),
  );

  const additions = state.tasks
    .filter((task) => isTaxTask(task))
    .filter((task) => !existingTaxTaskIds.has(task.id))
    .map((task) => buildFreeTaxUsaWorkflow(task));

  if (additions.length === 0) return state;

  return {
    ...state,
    workflows: [...additions, ...state.workflows],
  };
}

function applyAutoQueue(tasks: TaskCard[]): TaskCard[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return tasks.map((task) =>
    task.status === "triaged" && new Date(task.createdAt).getTime() <= cutoff
      ? { ...task, status: "queued" as const, updatedAt: new Date().toISOString() }
      : task,
  );
}

function statusDotClass(status: TaskStatus) {
  if (status === "done") return "dot-done";
  if (status === "waiting-on-you") return "dot-warning";
  if (status === "in-progress" || status === "queued") return "dot-active";
  return "dot-muted";
}

// ─── TaskItem ───────────────────────────────────────────────────────────────

function TaskItem({
  task,
  job,
  workflow,
  isExpanded,
  onToggle,
  onStart,
  onDone,
  onUpdate,
  onToggleWorkflowItem,
  onUpdateTaxWorkflow,
}: {
  task: TaskCard;
  job?: AgentJob;
  workflow?: WorkflowRun;
  isExpanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  onDone: () => void;
  onUpdate: (patch: Partial<TaskCard>) => void;
  onToggleWorkflowItem: (workflowId: string, itemId: string) => void;
  onUpdateTaxWorkflow: (
    workflowId: string,
    patch: Partial<
      Pick<
        TaxWorkflowPayload,
        "filingStatus" | "needsStateReturn" | "hasMarketplaceInsurance" | "priorYearSignatureReady" | "accountReady"
      >
    >,
  ) => void;
}) {
  const taxWorkflow =
    workflow?.workflowKey === "tax-freetaxusa"
      ? (workflow.payload as TaxWorkflowPayload)
      : null;

  return (
    <article
      className={[
        "task-item",
        task.status === "done" ? "task-done" : "",
        task.category === "splitcheck" ? "task-splitcheck" : "",
        isExpanded ? "task-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button className="task-row" onClick={onToggle}>
        <span className={`status-dot ${statusDotClass(task.status)}`} />
        <div className="task-summary">
          <span className="task-title">{task.title}</span>
          {task.context && !isExpanded && (
            <span className="task-preview">{task.context}</span>
          )}
        </div>
        <span className="task-status-label">{task.status}</span>
      </button>

      {isExpanded && (
        <div className="task-body">
          <div className="task-field">
            <label className="field-label">Title</label>
            <input
              className="field-input"
              value={task.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
          </div>
          <div className="task-field">
            <label className="field-label">Description</label>
            <textarea
              className="field-input"
              rows={3}
              value={task.context}
              onChange={(e) => onUpdate({ context: e.target.value })}
            />
          </div>
          <div className="task-selects">
            <div className="task-field">
              <label className="field-label">Category</label>
              <select
                className="field-input"
                value={task.category}
                onChange={(e) => onUpdate({ category: e.target.value as TaskCategory })}
              >
                <option value="finance">Finance</option>
                <option value="health">Health</option>
                <option value="career">Career</option>
                <option value="admin">Admin</option>
                <option value="other">Other</option>
                <option value="splitcheck">SplitCheck</option>
              </select>
            </div>
            <div className="task-field">
              <label className="field-label">Complexity</label>
              <select
                className="field-input"
                value={task.complexity}
                onChange={(e) => onUpdate({ complexity: e.target.value as TaskComplexity })}
              >
                <option value="quick">Quick</option>
                <option value="research">Research</option>
                <option value="multi-step">Multi-step</option>
              </select>
            </div>
          </div>
          {/* Agent output */}
          {job && (
            <div className="job-output">
              <div className="field-label">
                {job.status === "completed" ? "Result" :
                 job.status === "waiting-on-user" ? "Agent needs your input" :
                 "Agent working..."}
              </div>
              <p className="output-text">{job.output}</p>
              {job.followUpQuestions.length > 0 && (
                <div className="followup-block">
                  {job.followUpQuestions.map((q) => (
                    <p className="followup-q" key={q}>{q}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {taxWorkflow && (
            <div className="workflow-panel">
              <div className="field-label">FreeTaxUSA execution plan</div>
              <p className="workflow-summary">{taxWorkflow.summary}</p>
              <div className="workflow-next">
                <strong>Next:</strong> {taxWorkflow.nextAction}
              </div>
              <div className="workflow-intake">
                <label className="workflow-field">
                  <span className="workflow-mini-label">Filing status</span>
                  <select
                    className="field-input"
                    value={taxWorkflow.filingStatus}
                    onChange={(e) =>
                      workflow &&
                      onUpdateTaxWorkflow(workflow.id, {
                        filingStatus: e.target.value as TaxWorkflowPayload["filingStatus"],
                      })
                    }
                  >
                    <option value="unknown">Choose later</option>
                    <option value="single">Single</option>
                    <option value="married-joint">Married filing jointly</option>
                    <option value="married-separate">Married filing separately</option>
                    <option value="head-household">Head of household</option>
                  </select>
                </label>
                <label className="workflow-toggle">
                  <input
                    type="checkbox"
                    checked={taxWorkflow.needsStateReturn}
                    onChange={() =>
                      workflow &&
                      onUpdateTaxWorkflow(workflow.id, {
                        needsStateReturn: !taxWorkflow.needsStateReturn,
                      })
                    }
                  />
                  <span>Need state return</span>
                </label>
                <label className="workflow-toggle">
                  <input
                    type="checkbox"
                    checked={taxWorkflow.hasMarketplaceInsurance}
                    onChange={() =>
                      workflow &&
                      onUpdateTaxWorkflow(workflow.id, {
                        hasMarketplaceInsurance: !taxWorkflow.hasMarketplaceInsurance,
                      })
                    }
                  />
                  <span>Had Marketplace insurance</span>
                </label>
                <label className="workflow-toggle">
                  <input
                    type="checkbox"
                    checked={taxWorkflow.priorYearSignatureReady}
                    onChange={() =>
                      workflow &&
                      onUpdateTaxWorkflow(workflow.id, {
                        priorYearSignatureReady: !taxWorkflow.priorYearSignatureReady,
                      })
                    }
                  />
                  <span>AGI or prior-year PIN ready</span>
                </label>
                <label className="workflow-toggle">
                  <input
                    type="checkbox"
                    checked={taxWorkflow.accountReady}
                    onChange={() =>
                      workflow &&
                      onUpdateTaxWorkflow(workflow.id, {
                        accountReady: !taxWorkflow.accountReady,
                      })
                    }
                  />
                  <span>FreeTaxUSA account ready</span>
                </label>
              </div>
              <div className="workflow-group">
                {taxWorkflow.checklist.map((item) => (
                  <label className="workflow-check" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => workflow && onToggleWorkflowItem(workflow.id, item.id)}
                    />
                    <span>
                      <span className="workflow-check-label">{item.label}</span>
                      {item.detail && <span className="workflow-check-detail">{item.detail}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {taxWorkflow.blockers.length > 0 && (
                <div className="workflow-group">
                  <div className="workflow-mini-label">Blockers</div>
                  {taxWorkflow.blockers.map((blocker) => (
                    <p className="workflow-note" key={blocker}>{blocker}</p>
                  ))}
                </div>
              )}
              {taxWorkflow.notes.length > 0 && (
                <div className="workflow-group">
                  <div className="workflow-mini-label">FreeTaxUSA notes</div>
                  {taxWorkflow.notes.map((note) => (
                    <p className="workflow-note" key={note}>{note}</p>
                  ))}
                </div>
              )}
              {taxWorkflow.sessionBrief.length > 0 && (
                <div className="workflow-group">
                  <div className="workflow-mini-label">Session brief</div>
                  {taxWorkflow.sessionBrief.map((line) => (
                    <p className="workflow-note" key={line}>{line}</p>
                  ))}
                </div>
              )}
              <div className={`workflow-readiness${taxWorkflow.sessionReady ? " ready" : ""}`}>
                {taxWorkflow.sessionReady
                  ? "Ready for supervised filing"
                  : "Still in prep mode"}
              </div>
            </div>
          )}

          <div className="task-actions">
            {task.status !== "in-progress" && task.status !== "done" && (
              <button className="button sm" onClick={onStart}>
                Start
              </button>
            )}
            {task.status === "in-progress" && !job?.followUpQuestions.length && (
              <span className="working-label">Agent working…</span>
            )}
            {task.status !== "done" && (
              <button className="ghost-button sm" onClick={onDone}>
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PersonalOpsApp() {
  const [booted, setBooted] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [ideas, setIdeas] = useState<IdeaCard[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [captureInput, setCaptureInput] = useState("");
  const voiceSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const [voiceState, setVoiceState] = useState<"idle" | "recording">("idle");
  const [draft, setDraft] = useState<DraftTriage | null>(null);
  const [draftSourceId, setDraftSourceId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [ideasExpanded, setIdeasExpanded] = useState(false);
  const [triageBusy, setTriageBusy] = useState(false);
  const [jobBusyId, setJobBusyId] = useState<string | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [apiProvider, setApiProvider] = useState<"heuristic" | "anthropic" | "openai">("heuristic");
  const [storageProvider, setStorageProvider] = useState<"supabase" | "memory">("memory");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    void fetch("/api/state")
      .then(async (response) => {
        if (!response.ok) throw new Error("State bootstrap failed");
        const payload = (await response.json()) as StateResponse;
        const localState = readLocalState();

        if (payload.provider === "supabase") {
          const nextState = withAutoWorkflows({
            captures: payload.captures,
            tasks: applyAutoQueue(payload.tasks),
            jobs: payload.jobs,
            ideas: payload.ideas,
            workflows: payload.workflows ?? [],
          });
          setCaptures(nextState.captures);
          setTasks(nextState.tasks);
          setJobs(nextState.jobs);
          setIdeas(nextState.ideas);
          setWorkflows(nextState.workflows);
          setStorageProvider("supabase");
          return;
        }

        if (localState) {
          const nextState = withAutoWorkflows(localState);
          setCaptures(nextState.captures);
          setTasks(nextState.tasks);
          setJobs(nextState.jobs);
          setIdeas(nextState.ideas);
          setWorkflows(nextState.workflows);
        } else {
          const nextState = withAutoWorkflows({
            captures: payload.captures,
            tasks: applyAutoQueue(payload.tasks),
            jobs: payload.jobs,
            ideas: payload.ideas,
            workflows: payload.workflows ?? [],
          });
          setCaptures(nextState.captures);
          setTasks(nextState.tasks);
          setJobs(nextState.jobs);
          setIdeas(nextState.ideas);
          setWorkflows(nextState.workflows);
        }

        setStorageProvider("memory");
      })
      .catch(() => {
        const nextState = withAutoWorkflows(readLocalState() ?? {
          captures: [],
          tasks: applyAutoQueue(initialTasks),
          jobs: initialJobs,
          ideas: initialIdeas,
          workflows: [],
        });

        setCaptures(nextState.captures);
        setTasks(nextState.tasks);
        setJobs(nextState.jobs);
        setIdeas(nextState.ideas);
        setWorkflows(nextState.workflows);
        setStorageProvider("memory");
      })
      .finally(() => {
        setBooted(true);
      });
  }, []);

  useEffect(() => {
    if (!booted) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ captures, tasks, jobs, ideas, workflows }),
    );

    startTransition(() => {
      void fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captures, tasks, jobs, ideas, workflows }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("State sync failed");
          const payload = (await response.json()) as { provider?: "supabase" | "memory"; ok?: boolean };
          if (payload.provider) setStorageProvider(payload.provider);
        })
        .catch(() => {
          setStorageProvider("memory");
        });
    });
  }, [booted, captures, tasks, jobs, ideas, workflows]);

  // ─── Computed ─────────────────────────────────────────────────────────────

  type ActionItem =
    | { type: "triage" }
    | { type: "followup"; job: AgentJob; task: TaskCard | undefined };

  const actionItem = useMemo<ActionItem | null>(() => {
    if (draft) return { type: "triage" };
    // Only surface the follow-up for tasks that are actually in-progress
    const waitingJob = jobs.find(
      (j) =>
        j.status === "waiting-on-user" &&
        tasks.find((t) => t.id === j.taskCardId && t.status === "in-progress"),
    );
    if (waitingJob) {
      return {
        type: "followup",
        job: waitingJob,
        task: tasks.find((t) => t.id === waitingJob.taskCardId),
      };
    }
    return null;
  }, [draft, jobs, tasks]);

  // In Progress: agent is working / waiting on user
  const inProgressTasks = useMemo(
    () => tasks.filter((t) => t.status === "in-progress" || t.status === "waiting-on-you"),
    [tasks],
  );
  // To Do: captured but not started
  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status === "triaged" || t.status === "queued"),
    [tasks],
  );
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function queueCapture(rawText: string, source: Capture["source"]) {
    if (!rawText.trim()) return;
    const capture: Capture = {
      id: uid("capture"),
      rawText: rawText.trim(),
      createdAt: new Date().toISOString(),
      source,
    };
    setCaptures((c) => [capture, ...c]);
    setDraftSourceId(capture.id);
    setTriageBusy(true);

    startTransition(() => {
      void fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: capture.rawText }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Triage failed");
          const result = (await response.json()) as TriageResult;
          setDraft(result.draft);
          setApiProvider(result.provider);
        })
        .catch(() => {
          setDraft(buildDraft(capture.rawText));
          setApiProvider("heuristic");
        })
        .finally(() => {
          setTriageBusy(false);
        });
    });
  }

  function submitCapture(source: Capture["source"], rawText?: string) {
    const input = (rawText ?? captureInput).trim();
    if (!input) return;
    queueCapture(input, source);
    if (!rawText) setCaptureInput("");
  }

  function createTaskFromDraft(initialStatus?: TaskStatus) {
    if (!draft || !draftSourceId) return;
    const now = new Date().toISOString();
    const status = initialStatus ?? (draft.complexity === "quick" ? "queued" : "triaged");
    const task: TaskCard = {
      id: uid("task"),
      title: draft.title,
      context: draft.context,
      category: draft.flaggedAsSplitcheck ? "splitcheck" : draft.category,
      complexity: draft.complexity,
      status,
      dueDate: draft.dueDate,
      sourceCaptureId: draftSourceId,
      createdAt: now,
      updatedAt: now,
    };
    setTasks((t) => [task, ...t]);
    if (isTaxTask(task)) {
      setWorkflows((current) => [buildFreeTaxUsaWorkflow(task), ...current]);
    }
    setDraft(null);
    setDraftSourceId(null);
  }

  function ensureWorkflow(task: TaskCard) {
    if (!isTaxTask(task)) return;
    setWorkflows((current) => {
      if (current.some((workflow) => workflow.taskCardId === task.id && workflow.workflowKey === "tax-freetaxusa")) {
        return current;
      }
      return [buildFreeTaxUsaWorkflow(task), ...current];
    });
  }

  function updateTask(taskId: string, patch: Partial<TaskCard>) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, ...patch, updatedAt: new Date().toISOString() }
          : task,
      ),
    );
  }

  function confirmAndStart(task: TaskCard) {
    setExpandedTaskId(task.id); // always show the card so output is visible
    setJobBusyId(task.id);
    ensureWorkflow(task);

    startTransition(() => {
      void fetch("/api/agent-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", task }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Agent start failed");
          const result = (await response.json()) as AgentJobResult;
          const nextStatus = result.job.status === "completed" ? "done" : "in-progress";
          updateTask(task.id, { status: nextStatus });
          setJobs((current) => [result.job, ...current.filter((job) => job.taskCardId !== task.id)]);
          setApiProvider(result.provider);
        })
        .catch(() => {
          const job = startHeuristicJob(task);
          const nextStatus = job.status === "completed" ? "done" : "in-progress";
          updateTask(task.id, { status: nextStatus });
          setJobs((current) => [job, ...current.filter((item) => item.taskCardId !== task.id)]);
          setApiProvider("heuristic");
        })
        .finally(() => {
          setJobBusyId(null);
        });
    });
  }

  function completeTask(taskId: string) {
    updateTask(taskId, { status: "done" });
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.taskCardId === taskId
          ? { ...workflow, status: "done", updatedAt: new Date().toISOString() }
          : workflow,
      ),
    );
  }

  function toggleWorkflowItem(workflowId: string, itemId: string) {
    setWorkflows((current) =>
      current.map((workflow) => {
        if (workflow.id !== workflowId || workflow.workflowKey !== "tax-freetaxusa") return workflow;
        return toggleTaxChecklistItem(workflow, itemId);
      }),
    );
  }

  function updateTaxWorkflow(
    workflowId: string,
    patch: Partial<
      Pick<
        TaxWorkflowPayload,
        "filingStatus" | "needsStateReturn" | "hasMarketplaceInsurance" | "priorYearSignatureReady" | "accountReady"
      >
    >,
  ) {
    setWorkflows((current) =>
      current.map((workflow) => {
        if (workflow.id !== workflowId || workflow.workflowKey !== "tax-freetaxusa") return workflow;
        return updateTaxWorkflowFields(workflow, patch);
      }),
    );
  }

  function answerFollowUp(jobId: string) {
    const relatedJob = jobs.find((j) => j.id === jobId);
    if (!relatedJob || !followUpAnswer.trim()) return;

    setJobBusyId(relatedJob.taskCardId);
    startTransition(() => {
      void fetch("/api/agent-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "continue", job: relatedJob, answer: followUpAnswer }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Agent continue failed");
          const result = (await response.json()) as AgentJobResult;
          setJobs((current) => current.map((job) => (job.id === jobId ? result.job : job)));
          updateTask(relatedJob.taskCardId, { status: "done" });
          setFollowUpAnswer("");
          setApiProvider(result.provider);
        })
        .catch(() => {
          setJobs((current) =>
            current.map((job) =>
              job.id === jobId
                ? {
                    ...job,
                    status: "completed",
                    followUpQuestions: [],
                    output: `${job.output} Follow-up received: ${followUpAnswer.trim()}. Agent finished the next pass.`,
                    completedAt: new Date().toISOString(),
                  }
                : job,
            ),
          );
          updateTask(relatedJob.taskCardId, { status: "done" });
          setFollowUpAnswer("");
          setApiProvider("heuristic");
        })
        .finally(() => {
          setJobBusyId(null);
        });
    });
  }

  function convertIdea(idea: IdeaCard) {
    const capture: Capture = {
      id: uid("capture"),
      rawText: idea.prompt,
      createdAt: new Date().toISOString(),
      source: idea.category === "splitcheck" ? "splitcheck" : "text",
    };
    setCaptures((c) => [capture, ...c]);
    setTasks((current) => [
      {
        id: uid("task"),
        title: idea.title,
        context: idea.prompt,
        category: idea.category,
        complexity: "quick",
        status: "queued",
        sourceCaptureId: capture.id,
        createdAt: capture.createdAt,
        updatedAt: capture.createdAt,
      },
      ...current,
    ]);
    setIdeas((current) => current.filter((item) => item.id !== idea.id));
  }

  async function transcribeAudio(blob: Blob) {
    const file = new File([blob], "voice.webm", { type: blob.type || "audio/webm" });
    const formData = new FormData();
    formData.append("audio", file);

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error("Transcription failed");
    }

    const payload = (await response.json()) as { text?: string; provider?: "openai" | "browser" };
    if (payload.text) {
      setCaptureInput(payload.text);
      if (payload.provider === "openai") {
        setApiProvider("openai");
      }
    }
  }

  function startBrowserSpeechCapture() {
    if (!voiceSupported) return;
    const SpeechRecognitionApi =
      (
        window as typeof window & {
          webkitSpeechRecognition?: new () => SpeechRecognition;
          SpeechRecognition?: new () => SpeechRecognition;
        }
      ).webkitSpeechRecognition ??
      (window as typeof window & { SpeechRecognition?: new () => SpeechRecognition })
        .SpeechRecognition;
    if (!SpeechRecognitionApi) return;

    const recognition = new SpeechRecognitionApi();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceState("recording");

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setCaptureInput(transcript);
      setVoiceState("idle");
    };
    recognition.onerror = () => setVoiceState("idle");
    recognition.onend = () => setVoiceState("idle");
    recognition.start();
  }

  async function startVoiceCapture() {
    if (voiceState === "recording" && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    if (typeof window !== "undefined" && "MediaRecorder" in window && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        mediaRecorderRef.current = recorder;
        setVoiceState("recording");

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          audioChunksRef.current = [];
          mediaRecorderRef.current = null;
          stream.getTracks().forEach((track) => track.stop());
          setVoiceState("idle");

          void transcribeAudio(blob).catch(() => {
            startBrowserSpeechCapture();
          });
        };

        recorder.start();
        return;
      } catch {
        // Fall through to browser speech API.
      }
    }

    startBrowserSpeechCapture();
  }

  function toggleTask(id: string) {
    setExpandedTaskId((current) => (current === id ? null : id));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="shell">
      {/* Always-visible capture */}
      <section className="capture-bar">
        <textarea
          rows={2}
          value={captureInput}
          onChange={(e) => setCaptureInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitCapture("text");
          }}
          placeholder="What's on your mind?"
        />
        <div className="capture-row">
          <span className="capture-mode">
            {storageProvider === "supabase" ? "Synced" : "Local"} ·{" "}
            {apiProvider === "anthropic"
              ? "Anthropic"
              : apiProvider === "openai"
                ? "OpenAI"
                : "Heuristic"}
          </span>
          {(voiceSupported || (typeof window !== "undefined" && "MediaRecorder" in window)) && (
            <button
              className={`icon-button${voiceState === "recording" ? " recording" : ""}`}
              onClick={startVoiceCapture}
              aria-label="Voice capture"
            >
              {voiceState === "recording" ? "●" : "🎤"}
            </button>
          )}
          <button className="button" disabled={triageBusy} onClick={() => submitCapture("text")}>
            {triageBusy ? "Thinking..." : "Add"}
          </button>
        </div>
      </section>

      {/* Action zone — only renders when something needs the user */}
      {actionItem && (
        <section className="action-zone">
          {actionItem.type === "triage" && draft && (
            <article className="action-card">
              <div className="action-label">Does this look right?</div>
              <input
                className="action-title-input"
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, title: e.target.value } : d))
                }
              />
              <div className="triage-meta">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, category: e.target.value as TaskCategory } : d,
                    )
                  }
                >
                  <option value="finance">Finance</option>
                  <option value="health">Health</option>
                  <option value="career">Career</option>
                  <option value="admin">Admin</option>
                  <option value="other">Other</option>
                  <option value="splitcheck">SplitCheck</option>
                </select>
                <select
                  value={draft.complexity}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, complexity: e.target.value as TaskComplexity } : d,
                    )
                  }
                >
                  <option value="quick">Quick</option>
                  <option value="research">Research</option>
                  <option value="multi-step">Multi-step</option>
                </select>
              </div>
              <div className="action-buttons">
                <button className="button" onClick={() => createTaskFromDraft()} disabled={triageBusy}>
                  Looks right
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setDraft(null);
                    setDraftSourceId(null);
                  }}
                >
                  Discard
                </button>
              </div>
              {draft.flaggedAsSplitcheck && (
                <div className="action-hint">Looks like a SplitCheck request</div>
              )}
              {triageBusy && <div className="pending-hint">Refining capture...</div>}
            </article>
          )}

          {actionItem.type === "followup" && (
            <article className="action-card warning-card">
              <div className="action-label">Agent has a question</div>
              {actionItem.task && (
                <div className="action-task-title">{actionItem.task.title}</div>
              )}
              {actionItem.job.followUpQuestions.map((q) => (
                <p className="action-body" key={q}>
                  {q}
                </p>
              ))}
              <textarea
                className="action-response"
                rows={3}
                value={followUpAnswer}
                onChange={(e) => setFollowUpAnswer(e.target.value)}
                placeholder="Reply so the agent can continue..."
              />
              <div className="action-buttons">
                <button
                  className="button"
                  disabled={!followUpAnswer.trim() || jobBusyId === actionItem.job.taskCardId}
                  onClick={() => answerFollowUp(actionItem.job.id)}
                >
                  Answer &amp; continue
                </button>
              </div>
            </article>
          )}

        </section>
      )}

      {/* In Progress — agent working, output visible */}
      {inProgressTasks.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>In Progress</span>
            <span className="count-badge">{inProgressTasks.length}</span>
          </div>
          <div className="task-list">
            {inProgressTasks.map((task) => {
              const job = jobs.find((j) => j.taskCardId === task.id);
              const workflow = workflows.find((item) => item.taskCardId === task.id);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  job={job}
                  workflow={workflow}
                  isExpanded={expandedTaskId === task.id}
                  onToggle={() => toggleTask(task.id)}
                  onStart={() => confirmAndStart(task)}
                  onDone={() => completeTask(task.id)}
                  onUpdate={(patch) => updateTask(task.id, patch)}
                  onToggleWorkflowItem={toggleWorkflowItem}
                  onUpdateTaxWorkflow={updateTaxWorkflow}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* To Do — captured, not yet started */}
      {pendingTasks.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>To Do</span>
            <span className="count-badge">{pendingTasks.length}</span>
          </div>
          <div className="task-list">
            {pendingTasks.map((task) => {
              const job = jobs.find((j) => j.taskCardId === task.id);
              const workflow = workflows.find((item) => item.taskCardId === task.id);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  job={job}
                  workflow={workflow}
                  isExpanded={expandedTaskId === task.id}
                  onToggle={() => toggleTask(task.id)}
                  onStart={() => confirmAndStart(task)}
                  onDone={() => completeTask(task.id)}
                  onUpdate={(patch) => updateTask(task.id, patch)}
                  onToggleWorkflowItem={toggleWorkflowItem}
                  onUpdateTaxWorkflow={updateTaxWorkflow}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {inProgressTasks.length === 0 && pendingTasks.length === 0 && doneTasks.length === 0 && (
        <div className="empty-hint">Nothing here yet. Add something above.</div>
      )}

      {/* Done — completed tasks with output */}
      {doneTasks.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>Done</span>
            <span className="count-badge">{doneTasks.length}</span>
          </div>
          <div className="task-list">
            {doneTasks.map((task) => {
              const job = jobs.find((j) => j.taskCardId === task.id);
              const workflow = workflows.find((item) => item.taskCardId === task.id);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  job={job}
                  workflow={workflow}
                  isExpanded={expandedTaskId === task.id}
                  onToggle={() => toggleTask(task.id)}
                  onStart={() => confirmAndStart(task)}
                  onDone={() => completeTask(task.id)}
                  onUpdate={(patch) => updateTask(task.id, patch)}
                  onToggleWorkflowItem={toggleWorkflowItem}
                  onUpdateTaxWorkflow={updateTaxWorkflow}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Ideas — collapsible */}
      {ideas.length > 0 && (
        <section className="ideas-section">
          <button
            className="section-toggle"
            onClick={() => setIdeasExpanded((v) => !v)}
          >
            <span>Ideas</span>
            <span className="count-badge">{ideas.length}</span>
            <span className="toggle-arrow">{ideasExpanded ? "↑" : "↓"}</span>
          </button>

          {ideasExpanded && (
            <div className="ideas-list">
              {ideas.map((idea) => (
                <article className="idea-item" key={idea.id}>
                  <div className="idea-title">{idea.title}</div>
                  <p className="idea-prompt">{idea.prompt}</p>
                  <button className="ghost-button sm" onClick={() => convertIdea(idea)}>
                    Add this
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
