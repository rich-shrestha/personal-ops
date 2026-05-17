"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { initialIdeas, initialJobs, initialTasks } from "@/lib/mock-data";
import { buildDraft, startHeuristicJob, uid } from "@/lib/personal-ops";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AgentJob,
  AgentJobResult,
  Capture,
  DraftTriage,
  IdeaCard,
  TaskArea,
  TaskCard,
  TaskCategory,
  TaskComplexity,
  TaskHorizon,
  TaskStatus,
  ThinkEntry,
  TriageResult,
  WorkflowRun,
  TaxWorkflowPayload,
} from "@/lib/types";
import {
  advanceTaxSessionStep,
  buildFreeTaxUsaWorkflow,
  isTaxTask,
  prepareTaxBrowserHandoff,
  resetTaxSession,
  requestTaxBrowserExecution,
  startTaxFilingSession,
  toggleTaxChecklistItem,
  updateTaxWorkflowFields,
} from "@/lib/workflows";
import ScheduleView from "@/components/schedule-view";

const storageKey = "personal-ops-state-v1";

interface PersistedState {
  captures: Capture[];
  tasks: TaskCard[];
  jobs: AgentJob[];
  ideas: IdeaCard[];
  workflows: WorkflowRun[];
  thinkEntries: ThinkEntry[];
}

interface StateResponse extends PersistedState {
  provider?: "supabase" | "memory";
}

type AreaToggle = "all" | TaskArea;
type MobileTab = "active" | "think" | "done" | "ideas";

interface PersonalOpsAppProps {
  userEmail?: string;
}

function readLocalState(): PersistedState | null {
  if (typeof window === "undefined") return null;

  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as PersistedState;
    return {
      captures: parsed.captures ?? [],
      tasks: applyAutoQueue(
        (parsed.tasks ?? []).map((task) => ({
          ...task,
          area: task.area === "work" ? "work" : "personal",
        })),
      ),
      jobs: (parsed.jobs ?? []).map((job) => ({
        ...job,
        provider:
          job.provider === "anthropic" || job.provider === "openai"
            ? job.provider
            : "heuristic",
      })),
      ideas: parsed.ideas ?? [],
      workflows: parsed.workflows ?? [],
      thinkEntries: parsed.thinkEntries ?? [],
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

type TaskBucketKey =
  | "next-up"
  | "finance"
  | "inbox"
  | "travel"
  | "career"
  | "health"
  | "splitcheck"
  | "other";

interface TaskBucket {
  key: TaskBucketKey;
  label: string;
  description: string;
  tasks: TaskCard[];
}

function sortTasksForDisplay(tasks: TaskCard[]) {
  return [...tasks].sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;

    const statusWeight = (task: TaskCard) => {
      if (task.status === "queued") return 0;
      if (task.status === "triaged") return 1;
      if (task.status === "waiting-on-you") return 2;
      if (task.status === "in-progress") return 3;
      return 4;
    };

    const complexityWeight = (task: TaskCard) => {
      if (task.complexity === "quick") return 0;
      if (task.complexity === "research") return 1;
      return 2;
    };

    const statusDelta = statusWeight(a) - statusWeight(b);
    if (statusDelta !== 0) return statusDelta;

    const complexityDelta = complexityWeight(a) - complexityWeight(b);
    if (complexityDelta !== 0) return complexityDelta;

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function inferTaskBucket(task: TaskCard): TaskBucketKey {
  const haystack = `${task.title} ${task.context}`.toLowerCase();

  if (task.status === "queued" && task.complexity === "quick") return "next-up";
  if (task.category === "finance") return "finance";
  if (task.category === "career") return "career";
  if (task.category === "health") return "health";
  if (task.category === "splitcheck") return "splitcheck";

  if (
    haystack.match(/inbox|reply|respond|follow up|follow-up|email|message|text back|call|reach out/)
  ) {
    return "inbox";
  }

  if (
    haystack.match(/travel|trip|flight|hotel|errand|pickup|drop off|buy|purchase|renew|appointment/)
  ) {
    return "travel";
  }

  if (task.category === "admin" && haystack.match(/deadline|urgent|soon|today|tomorrow/)) {
    return "next-up";
  }

  return task.category === "admin" ? "inbox" : "other";
}


function isArchived(task: TaskCard) {
  return Boolean(task.archivedAt);
}

function buildTaskBuckets(tasks: TaskCard[]): TaskBucket[] {
  const buckets: TaskBucket[] = [
    { key: "next-up", label: "What Should I Do Next?", description: "Low-friction wins and immediate next moves.", tasks: [] },
    { key: "finance", label: "Subscriptions and Finances", description: "Money, bills, charges, paperwork, and account tasks.", tasks: [] },
    { key: "inbox", label: "Inbox / Follow-ups", description: "Messages, replies, outreach, and loose admin threads.", tasks: [] },
    { key: "travel", label: "Travel / Errands", description: "Trips, logistics, renewals, and things to batch while out.", tasks: [] },
    { key: "career", label: "Career Pipeline", description: "Applications, portfolio work, outreach, and interview prep.", tasks: [] },
    { key: "health", label: "Health", description: "Appointments, insurance, medication, and care admin.", tasks: [] },
    { key: "splitcheck", label: "SplitCheck", description: "Payment requests and money collection flows.", tasks: [] },
    { key: "other", label: "Other", description: "Everything that does not fit a repeat bucket yet.", tasks: [] },
  ];

  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const task of sortTasksForDisplay(tasks)) {
    bucketByKey.get(inferTaskBucket(task))?.tasks.push(task);
  }

  for (const bucket of buckets) {
    bucket.tasks.sort((a, b) => {
      if (a.sortOrder === undefined && b.sortOrder === undefined) return 0;
      if (a.sortOrder === undefined) return 1;
      if (b.sortOrder === undefined) return -1;
      return a.sortOrder - b.sortOrder;
    });
  }

  return buckets.filter((bucket) => bucket.tasks.length > 0);
}

// ─── TaskItem ───────────────────────────────────────────────────────────────

function TaskItem({
  task,
  job,
  workflow,
  isExpanded,
  isRunning,
  onToggle,
  onStart,
  onDone,
  onArchive,
  onRestore,
  onDelete,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onToggleWorkflowItem,
  onUpdateTaxWorkflow,
  onStartTaxSession,
  onAdvanceTaxSession,
  onResetTaxSession,
  onPrepareBrowserHandoff,
  onRequestBrowserExecution,
  onReopen,
}: {
  task: TaskCard;
  job?: AgentJob;
  workflow?: WorkflowRun;
  isExpanded: boolean;
  isRunning: boolean;
  onToggle: () => void;
  onStart: () => void;
  onDone: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<TaskCard>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onReopen?: () => void;
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
  onStartTaxSession: (workflowId: string) => void;
  onAdvanceTaxSession: (workflowId: string) => void;
  onResetTaxSession: (workflowId: string) => void;
  onPrepareBrowserHandoff: (task: TaskCard, workflowId: string) => void;
  onRequestBrowserExecution: (workflowId: string) => void;
}) {
  const taxWorkflow =
    workflow?.workflowKey === "tax-freetaxusa"
      ? (workflow.payload as TaxWorkflowPayload)
      : null;

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
  // Sync draft when task.notes changes externally (initial load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setNoteDraft(task.notes ?? ""); }, [task.id]);

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
          <span className="task-title-row">
            <span className="task-title">{task.title}</span>
            <span className={`scope-pill ${task.area}`}>{task.area}</span>
            <span
              className={`horizon-pill horizon-${task.horizon ?? "someday"}`}
              onClick={(e) => {
                e.stopPropagation();
                const cycle: TaskHorizon[] = ["today", "weekend", "this-week", "someday"];
                const current = task.horizon ?? "someday";
                const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
                onUpdate({ horizon: next });
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  const cycle: TaskHorizon[] = ["today", "weekend", "this-week", "someday"];
                  const current = task.horizon ?? "someday";
                  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
                  onUpdate({ horizon: next });
                }
              }}
            >
              {task.horizon === "today"
                ? "Today"
                : task.horizon === "weekend"
                ? "Weekend"
                : task.horizon === "this-week"
                ? "This Week"
                : "Someday"}
            </span>
          </span>
          {task.context && !isExpanded && (
            <span className="task-preview">{task.context}</span>
          )}
        </div>
        <span className="task-status-label">{task.status}</span>
      </button>

      {(onMoveUp || onMoveDown) && (
        <div className="task-reorder-btns">
          <button
            className="reorder-btn"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label="Move up"
          >▲</button>
          <button
            className="reorder-btn"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label="Move down"
          >▼</button>
        </div>
      )}

      <div className="task-notes-area">
        {isEditingNotes ? (
          <div className="notes-editor">
            <textarea
              className="notes-textarea"
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add your own context, links, or reminders…"
              autoFocus
            />
            <div className="notes-actions">
              <button
                className="notes-save-btn"
                onClick={() => {
                  onUpdate({ notes: noteDraft.trim() || undefined });
                  setIsEditingNotes(false);
                }}
              >
                Save
              </button>
              <button
                className="notes-cancel-btn"
                onClick={() => {
                  setNoteDraft(task.notes ?? "");
                  setIsEditingNotes(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : task.notes ? (
          <button
            className="context-preview"
            onClick={(e) => { e.stopPropagation(); setIsEditingNotes(true); }}
          >
            <span className="context-pencil">✏️</span>
            <em>{task.notes.length > 80 ? `${task.notes.slice(0, 80)}…` : task.notes}</em>
          </button>
        ) : (
          <button
            className="notes-add-btn"
            onClick={(e) => { e.stopPropagation(); setIsEditingNotes(true); }}
          >
            + Add context
          </button>
        )}
      </div>

      {task.status === "done" && !isArchived(task) && onReopen && (
        <div className="task-reopen-row">
          <button
            className="task-reopen-btn"
            onClick={(e) => { e.stopPropagation(); onReopen(); }}
          >
            ↩ Reopen
          </button>
        </div>
      )}

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
              <label className="field-label">Scope</label>
              <select
                className="field-input"
                value={task.area}
                onChange={(e) => onUpdate({ area: e.target.value as TaskArea })}
              >
                <option value="personal">Personal</option>
                <option value="work">Work</option>
              </select>
            </div>
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
              <div className="workflow-group">
                <div className="workflow-mini-label">Filing session runner</div>
                <div className="workflow-session-status">
                  {taxWorkflow.sessionStatus === "idle"
                    ? "Not started"
                    : taxWorkflow.sessionStatus === "running"
                      ? `Step ${Math.min(taxWorkflow.currentStepIndex + 1, taxWorkflow.sessionSteps.length)} of ${taxWorkflow.sessionSteps.length}`
                      : "Session steps completed"}
                </div>
                <div className="workflow-group">
                  {taxWorkflow.sessionSteps.map((step, index) => (
                    <div
                      className={`workflow-session-step${
                        index === taxWorkflow.currentStepIndex && taxWorkflow.sessionStatus !== "complete"
                          ? " current"
                          : ""
                      }${step.done ? " done" : ""}`}
                      key={step.id}
                    >
                      <div className="workflow-check-label">{step.label}</div>
                      {step.detail && <div className="workflow-check-detail">{step.detail}</div>}
                    </div>
                  ))}
                </div>
                <div className="action-buttons">
                  <button
                    className="button sm"
                    disabled={!taxWorkflow.sessionReady || taxWorkflow.sessionStatus === "running"}
                    onClick={() => workflow && onStartTaxSession(workflow.id)}
                  >
                    Start filing session
                  </button>
                  <button
                    className="ghost-button sm"
                    disabled={taxWorkflow.sessionStatus !== "running"}
                    onClick={() => workflow && onAdvanceTaxSession(workflow.id)}
                  >
                    Complete current step
                  </button>
                  <button
                    className="ghost-button sm"
                    disabled={taxWorkflow.sessionStatus === "idle"}
                    onClick={() => workflow && onResetTaxSession(workflow.id)}
                  >
                    Reset session
                  </button>
                </div>
              </div>
              <div className="workflow-group">
                <div className="workflow-mini-label">Browser automation handoff</div>
                <div className="workflow-session-status">
                  {taxWorkflow.browserHandoffStatus === "idle"
                    ? "Not prepared"
                    : taxWorkflow.browserHandoffStatus === "prepared"
                      ? "Prepared for a future browser worker"
                      : "Execution requested"}
                </div>
                {taxWorkflow.browserHandoffPlan.length > 0 && (
                  <div className="workflow-group">
                    {taxWorkflow.browserHandoffPlan.map((step) => (
                      <p className="workflow-note" key={step}>{step}</p>
                    ))}
                  </div>
                )}
                {taxWorkflow.browserHandoffWarnings.length > 0 && (
                  <div className="workflow-group">
                    {taxWorkflow.browserHandoffWarnings.map((warning) => (
                      <p className="workflow-note" key={warning}>{warning}</p>
                    ))}
                  </div>
                )}
                <div className="action-buttons">
                  <button
                    className="button sm"
                    disabled={!taxWorkflow.sessionReady}
                    onClick={() => workflow && onPrepareBrowserHandoff(task, workflow.id)}
                  >
                    Prepare browser handoff
                  </button>
                  <button
                    className="ghost-button sm"
                    disabled={taxWorkflow.browserHandoffStatus !== "prepared"}
                    onClick={() => workflow && onRequestBrowserExecution(workflow.id)}
                  >
                    Request execution
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="task-actions">
            {isRunning ? (
              <span className="working-label">Claude is working…</span>
            ) : !isArchived(task) && task.status !== "in-progress" && task.status !== "done" ? (
              <button className="button sm" onClick={onStart}>
                Start
              </button>
            ) : task.status === "in-progress" && !job?.followUpQuestions.length && !job ? (
              <span className="working-label">Agent working…</span>
            ) : null}
            {task.status !== "done" && !isRunning && !isArchived(task) && (
              <button className="ghost-button sm" onClick={onDone}>
                Done
              </button>
            )}
            {!isRunning && !isArchived(task) && (
              <button className="ghost-button sm" onClick={onArchive}>
                Archive
              </button>
            )}
            {!isRunning && isArchived(task) && (
              <button className="ghost-button sm" onClick={onRestore}>
                Restore
              </button>
            )}
            {!isRunning && (
              <button className="ghost-button sm danger-button" onClick={onDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PersonalOpsApp({ userEmail }: PersonalOpsAppProps) {
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
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [triageBusy, setTriageBusy] = useState(false);
  const [jobBusyId, setJobBusyId] = useState<string | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [apiProvider, setApiProvider] = useState<"heuristic" | "anthropic" | "openai">("heuristic");
  const [storageProvider, setStorageProvider] = useState<"supabase" | "memory">("memory");
  const [areaToggle, setAreaToggle] = useState<AreaToggle>("all");
  const [mobileTab, setMobileTab] = useState<MobileTab>("active");
  const [thinkEntries, setThinkEntries] = useState<ThinkEntry[]>([]);
  const [thinkInput, setThinkInput] = useState("");
  const [thinkBusy, setThinkBusy] = useState(false);
  const [pendingThinkEntry, setPendingThinkEntry] = useState<ThinkEntry | null>(null);
  const [pendingTaskChecks, setPendingTaskChecks] = useState<boolean[]>([]);
  const [rankingBucket, setRankingBucket] = useState<TaskBucketKey | null>(null);
  const [rankTopReason, setRankTopReason] = useState<{ bucketKey: TaskBucketKey; reason: string } | null>(null);
  const [horizonFilter, setHorizonFilter] = useState<"all" | TaskHorizon>("all");
  const [scheduleViewActive, setScheduleViewActive] = useState(false);
  const [bucketViewActive, setBucketViewActive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | TaskCategory>("all");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function signOut() {
    window.localStorage.removeItem(storageKey);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      window.location.reload();
      return;
    }

    await supabase.auth.signOut();
    window.location.reload();
  }

  useEffect(() => {
    void fetch("/api/state")
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            window.location.reload();
            return {
              captures: [],
              tasks: [],
              jobs: [],
              ideas: [],
              workflows: [],
              thinkEntries: [],
              provider: "memory",
            } satisfies StateResponse;
          }
          throw new Error("State bootstrap failed");
        }
        const payload = (await response.json()) as StateResponse;
        const localState = readLocalState();

        if (payload.provider === "supabase") {
          const nextState = withAutoWorkflows({
            captures: payload.captures,
            tasks: applyAutoQueue(payload.tasks),
            jobs: payload.jobs,
            ideas: payload.ideas,
            workflows: payload.workflows ?? [],
            thinkEntries: payload.thinkEntries ?? [],
          });
          setCaptures(nextState.captures);
          setTasks(nextState.tasks);
          setJobs(nextState.jobs);
          setIdeas(nextState.ideas);
          setWorkflows(nextState.workflows);
          setThinkEntries(payload.thinkEntries ?? []);
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
          setThinkEntries(localState.thinkEntries ?? []);
        } else {
          const nextState = withAutoWorkflows({
            captures: payload.captures,
            tasks: applyAutoQueue(payload.tasks),
            jobs: payload.jobs,
            ideas: payload.ideas,
            workflows: payload.workflows ?? [],
            thinkEntries: payload.thinkEntries ?? [],
          });
          setCaptures(nextState.captures);
          setTasks(nextState.tasks);
          setJobs(nextState.jobs);
          setIdeas(nextState.ideas);
          setWorkflows(nextState.workflows);
          setThinkEntries(payload.thinkEntries ?? []);
        }

        setStorageProvider("memory");
      })
      .catch(() => {
        const localState = readLocalState();
        const nextState = withAutoWorkflows(localState ?? {
          captures: [],
          tasks: applyAutoQueue(initialTasks),
          jobs: initialJobs,
          ideas: initialIdeas,
          workflows: [],
          thinkEntries: [],
        });

        setCaptures(nextState.captures);
        setTasks(nextState.tasks);
        setJobs(nextState.jobs);
        setIdeas(nextState.ideas);
        setWorkflows(nextState.workflows);
        setThinkEntries(localState?.thinkEntries ?? []);
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
      JSON.stringify({ captures, tasks, jobs, ideas, workflows, thinkEntries }),
    );

    startTransition(() => {
      void fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captures, tasks, jobs, ideas, workflows, thinkEntries }),
      })
        .then(async (response) => {
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              window.location.reload();
              return;
            }
            const text = await response.text().catch(() => "(unreadable)");
            console.error("[sync] POST /api/state failed", response.status, text);
            throw new Error("State sync failed");
          }
          const payload = (await response.json()) as { provider?: "supabase" | "memory"; ok?: boolean };
          console.log("[sync] POST /api/state →", payload);
          if (payload.provider) setStorageProvider(payload.provider);
        })
        .catch((err) => {
          console.error("[sync] POST /api/state catch:", err);
          setStorageProvider("memory");
        });
    });
  }, [booted, captures, tasks, jobs, ideas, workflows, thinkEntries]);

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
    () =>
      sortTasksForDisplay(
        tasks.filter(
          (t) => !isArchived(t) && (t.status === "in-progress" || t.status === "waiting-on-you"),
        ),
      ),
    [tasks],
  );
  // To Do: captured but not started
  const pendingTasks = useMemo(
    () =>
      sortTasksForDisplay(
        tasks.filter((t) => !isArchived(t) && (t.status === "triaged" || t.status === "queued")),
      ),
    [tasks],
  );
  const doneTasks = useMemo(
    () => sortTasksForDisplay(tasks.filter((t) => !isArchived(t) && t.status === "done")),
    [tasks],
  );
  const archivedTasks = useMemo(
    () => sortTasksForDisplay(tasks.filter((t) => isArchived(t))),
    [tasks],
  );
  function matchesArea(task: TaskCard) {
    return areaToggle === "all" ? true : task.area === areaToggle;
  }

  const filteredInProgressTasks = useMemo(
    () => inProgressTasks.filter((task) => matchesArea(task)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaToggle, inProgressTasks],
  );
  const filteredPendingTasks = useMemo(
    () =>
      pendingTasks
        .filter((task) => matchesArea(task))
        .filter((task) => horizonFilter === "all" || task.horizon === horizonFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaToggle, pendingTasks, horizonFilter],
  );
  const filteredDoneTasks = useMemo(
    () => doneTasks.filter((task) => matchesArea(task)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaToggle, doneTasks],
  );
  const filteredArchivedTasks = useMemo(
    () => archivedTasks.filter((task) => matchesArea(task)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archivedTasks, areaToggle],
  );
  const pendingBuckets = useMemo(() => buildTaskBuckets(filteredPendingTasks), [filteredPendingTasks]);
  const flatActiveTasks = useMemo(
    () =>
      [...tasks]
        .filter((t) => !isArchived(t) && t.status !== "done")
        .filter((t) => areaToggle === "all" || t.area === areaToggle)
        .filter((t) => horizonFilter === "all" || t.horizon === horizonFilter)
        .filter((t) => categoryFilter === "all" || t.category === categoryFilter)
        .sort((a, b) => {
          if (a.sortOrder === undefined && b.sortOrder === undefined) return 0;
          if (a.sortOrder === undefined) return 1;
          if (b.sortOrder === undefined) return -1;
          return a.sortOrder - b.sortOrder;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, areaToggle, horizonFilter, categoryFilter],
  );
  const unprocessedCaptures = useMemo(() => {
    const processedCaptureIds = new Set(tasks.map((task) => task.sourceCaptureId));
    return captures
      .filter((capture) => !processedCaptureIds.has(capture.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [captures, tasks]);
  const waitingCount = useMemo(
    () => jobs.filter((job) => job.status === "waiting-on-user").length,
    [jobs],
  );
  const activeWorkflowCount = useMemo(
    () => workflows.filter((workflow) => workflow.status !== "done").length,
    [workflows],
  );

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
      area: draft.area,
      category: draft.flaggedAsSplitcheck ? "splitcheck" : draft.category,
      complexity: draft.complexity,
      status,
      dueDate: draft.dueDate,
      horizon: "someday",
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

  function reorderTaskInBucket(
    bucketTasks: TaskCard[],
    taskId: string,
    direction: "up" | "down",
  ) {
    const idx = bucketTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= bucketTasks.length) return;

    const withOrders = bucketTasks.map((t, i) => ({
      id: t.id,
      sortOrder: t.sortOrder ?? i * 1000,
    }));

    const orderA = withOrders[idx].sortOrder;
    const orderB = withOrders[swapIdx].sortOrder;

    setTasks((current) =>
      current.map((t) => {
        if (t.id === withOrders[idx].id)
          return { ...t, sortOrder: orderB, updatedAt: new Date().toISOString() };
        if (t.id === withOrders[swapIdx].id)
          return { ...t, sortOrder: orderA, updatedAt: new Date().toISOString() };
        return t;
      }),
    );
  }

  async function rankBucket(bucket: TaskBucket) {
    setRankingBucket(bucket.key);
    setRankTopReason(null);
    try {
      const res = await fetch("/api/rank-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: bucket.tasks.map((t) => ({ id: t.id, title: t.title, context: t.context })),
        }),
      });
      if (!res.ok) throw new Error("rank failed");
      const { rankedIds, topReason } = (await res.json()) as {
        rankedIds: string[];
        topReason: string;
      };
      setTasks((current) =>
        current.map((t) => {
          const rankIdx = rankedIds.indexOf(t.id);
          if (rankIdx === -1) return t;
          return { ...t, sortOrder: rankIdx * 1000, updatedAt: new Date().toISOString() };
        }),
      );
      if (topReason) {
        setRankTopReason({ bucketKey: bucket.key, reason: topReason });
      }
    } catch {
      // silently swallow — bucket stays in current order
    } finally {
      setRankingBucket(null);
    }
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
          updateTask(task.id, { status: "in-progress" });
          setJobs((current) => [result.job, ...current.filter((job) => job.taskCardId !== task.id)]);
          setApiProvider(result.provider);
        })
        .catch(() => {
          const job = startHeuristicJob(task);
          updateTask(task.id, { status: "in-progress" });
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

  function reopenTask(taskId: string) {
    updateTask(taskId, { status: "in-progress" });
  }

  function archiveTask(taskId: string) {
    updateTask(taskId, { archivedAt: new Date().toISOString() });
    setExpandedTaskId((current) => (current === taskId ? null : current));
  }

  function restoreTask(taskId: string) {
    updateTask(taskId, { archivedAt: undefined });
  }

  function deleteTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setJobs((current) => current.filter((job) => job.taskCardId !== taskId));
    setWorkflows((current) => current.filter((workflow) => workflow.taskCardId !== taskId));
    setExpandedTaskId((current) => (current === taskId ? null : current));
  }

  function deleteCapture(captureId: string) {
    setCaptures((current) => current.filter((capture) => capture.id !== captureId));
    if (draftSourceId === captureId) {
      setDraft(null);
      setDraftSourceId(null);
    }
  }

  function deleteIdea(ideaId: string) {
    setIdeas((current) => current.filter((idea) => idea.id !== ideaId));
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

  function startTaxSession(workflowId: string) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === workflowId && workflow.workflowKey === "tax-freetaxusa"
          ? startTaxFilingSession(workflow)
          : workflow,
      ),
    );
  }

  function advanceTaxSession(workflowId: string) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === workflowId && workflow.workflowKey === "tax-freetaxusa"
          ? advanceTaxSessionStep(workflow)
          : workflow,
      ),
    );
  }

  function resetTaxFilingSession(workflowId: string) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === workflowId && workflow.workflowKey === "tax-freetaxusa"
          ? resetTaxSession(workflow)
          : workflow,
      ),
    );
  }

  function prepareBrowserHandoff(task: TaskCard, workflowId: string) {
    setWorkflows((current) =>
      current.map((workflow) => {
        if (workflow.id !== workflowId || workflow.workflowKey !== "tax-freetaxusa") return workflow;
        return prepareTaxBrowserHandoff(workflow);
      }),
    );

    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) return;

    startTransition(() => {
      void fetch("/api/browser-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, workflow }),
      }).catch(() => {
        // The UI already stores a local prepared handoff state even if this request fails.
      });
    });
  }

  function requestBrowserExecution(workflowId: string) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === workflowId && workflow.workflowKey === "tax-freetaxusa"
          ? requestTaxBrowserExecution(workflow)
          : workflow,
      ),
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
          updateTask(relatedJob.taskCardId, { status: "in-progress" });
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
          updateTask(relatedJob.taskCardId, { status: "in-progress" });
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
        area: "personal",
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

  async function submitThinkEntry() {
    const text = thinkInput.trim();
    if (!text || thinkBusy) return;
    setThinkBusy(true);
    try {
      const response = await fetch("/api/think", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, area: areaToggle }),
      });
      if (!response.ok) throw new Error("Think API failed");
      const data = (await response.json()) as { entry: ThinkEntry };
      setPendingThinkEntry(data.entry);
      setPendingTaskChecks(data.entry.extractedTasks.map(() => true));
      setThinkInput("");
    } catch {
      const fallback: ThinkEntry = {
        id: `think-${Math.random().toString(36).slice(2, 10)}`,
        text,
        claudeResponse: "Could not reach AI — entry saved locally.",
        extractedTasks: [],
        confirmedTaskIds: [],
        area: areaToggle,
        createdAt: new Date().toISOString(),
      };
      setThinkEntries((current) => [fallback, ...current]);
      setThinkInput("");
    } finally {
      setThinkBusy(false);
    }
  }

  function confirmThinkTasks() {
    if (!pendingThinkEntry) return;
    const now = new Date().toISOString();
    const confirmedTasks: TaskCard[] = pendingThinkEntry.extractedTasks
      .filter((_, i) => pendingTaskChecks[i])
      .map((t) => ({
        id: `task-${Math.random().toString(36).slice(2, 10)}`,
        title: t.title,
        context: t.context,
        area: pendingThinkEntry.area === "all" ? "personal" : pendingThinkEntry.area,
        category: "other" as const,
        complexity: t.complexity,
        status: "triaged" as const,
        sourceCaptureId: "",
        createdAt: now,
        updatedAt: now,
      }));
    const confirmedIds = confirmedTasks.map((t) => t.id);
    const finalEntry: ThinkEntry = { ...pendingThinkEntry, confirmedTaskIds: confirmedIds };
    setThinkEntries((current) => [finalEntry, ...current]);
    setTasks((current) => [...confirmedTasks, ...current]);
    setPendingThinkEntry(null);
    setPendingTaskChecks([]);
  }

  function addDirectTask(title: string) {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const task: TaskCard = {
      id: `task-${Math.random().toString(36).slice(2, 10)}`,
      title: title.trim(),
      context: "",
      area: areaToggle === "all" ? "personal" : areaToggle,
      category: "other",
      complexity: "quick",
      status: "triaged",
      horizon: "someday",
      sourceCaptureId: "",
      createdAt: now,
      updatedAt: now,
    };
    setTasks((current) => [task, ...current]);
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
          {userEmail ? (
            <button className="ghost-button sm" onClick={() => void signOut()}>
              {userEmail} · Sign out
            </button>
          ) : null}
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
                  value={draft.area}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, area: e.target.value as TaskArea } : d,
                    )
                  }
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                </select>
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

      <div className="area-toggle">
        <button className={`area-toggle-btn${areaToggle === "all" ? " active" : ""}`} onClick={() => setAreaToggle("all")}>All</button>
        <button className={`area-toggle-btn${areaToggle === "personal" ? " active" : ""}`} onClick={() => setAreaToggle("personal")}>Personal</button>
        <button className={`area-toggle-btn${areaToggle === "work" ? " active" : ""}`} onClick={() => setAreaToggle("work")}>Work</button>
      </div>

      <nav className="mobile-tabbar">
        <button className={`mobile-tab${mobileTab === "active" ? " active" : ""}`} onClick={() => setMobileTab("active")}>Active</button>
        <button className={`mobile-tab${mobileTab === "think" ? " active" : ""}`} onClick={() => setMobileTab("think")}>Think</button>
        <button className={`mobile-tab${mobileTab === "done" ? " active" : ""}`} onClick={() => setMobileTab("done")}>Done</button>
        <button className={`mobile-tab${mobileTab === "ideas" ? " active" : ""}`} onClick={() => setMobileTab("ideas")}>Ideas</button>
      </nav>

      {mobileTab === "active" && (
      <section className="overview-section">
        <div className="section-header">
          <span>Overview</span>
        </div>
        <div className="overview-grid">
          <article className="overview-card">
            <div className="overview-label">Capture inbox</div>
            <div className="overview-value">{unprocessedCaptures.length}</div>
            <p className="overview-copy">
              Raw captures that have not been turned into a task yet.
            </p>
          </article>
          <article className="overview-card">
            <div className="overview-label">Next up</div>
            <div className="overview-value">
              {filteredPendingTasks.filter((task) => inferTaskBucket(task) === "next-up").length}
            </div>
            <p className="overview-copy">
              Quick wins and immediate next actions.
            </p>
          </article>
          <article className="overview-card">
            <div className="overview-label">Waiting on you</div>
            <div className="overview-value">{waitingCount}</div>
            <p className="overview-copy">
              Agent questions that need an answer before work can continue.
            </p>
          </article>
          <article className="overview-card">
            <div className="overview-label">Active workflows</div>
            <div className="overview-value">{activeWorkflowCount}</div>
            <p className="overview-copy">
              Structured flows like tax prep that are still in motion.
            </p>
          </article>
        </div>
      </section>
      )}

      {mobileTab === "active" && unprocessedCaptures.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>Capture Inbox</span>
            <span className="count-badge">{unprocessedCaptures.length}</span>
          </div>
          <div className="capture-inbox-list">
            {unprocessedCaptures.slice(0, 6).map((capture) => (
              <article className="capture-inbox-item" key={capture.id}>
                <div className="capture-inbox-meta">
                  <span>{capture.source}</span>
                  <span>{new Date(capture.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="capture-inbox-text">{capture.rawText}</p>
                <div className="capture-inbox-actions">
                  <button className="ghost-button sm danger-button" onClick={() => deleteCapture(capture.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Inline task add on Active tab */}
      {mobileTab === "active" && (
        <section style={{ padding: "0 0 8px" }}>
          <input
            className="task-add-input"
            placeholder="+ Add a task..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                addDirectTask(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
          />
        </section>
      )}

      {/* List / Buckets view toggle */}
      {mobileTab === "active" && !scheduleViewActive && (
        <div className="schedule-mode-toggle">
          <button
            className={`schedule-mode-btn${!bucketViewActive ? " active" : ""}`}
            onClick={() => setBucketViewActive(false)}
          >
            List
          </button>
          <button
            className={`schedule-mode-btn${bucketViewActive ? " active" : ""}`}
            onClick={() => setBucketViewActive(true)}
          >
            Buckets
          </button>
        </div>
      )}

      {/* Category filter pills — flat list only */}
      {mobileTab === "active" && !scheduleViewActive && !bucketViewActive && (
        <div className="horizon-toggle">
          {(["all", "finance", "career", "health", "admin", "splitcheck", "other"] as const).map((cat) => (
            <button
              key={cat}
              className={`horizon-btn${categoryFilter === cat ? " active" : ""}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === "all" ? "All" : cat === "splitcheck" ? "SplitCheck" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* In Progress — agent working, output visible */}
      {mobileTab === "active" && !scheduleViewActive && bucketViewActive && filteredInProgressTasks.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>In Progress</span>
            <span className="count-badge">{filteredInProgressTasks.length}</span>
          </div>
          <div className="task-list">
            {filteredInProgressTasks.map((task) => {
              const job = jobs.find((j) => j.taskCardId === task.id);
              const workflow = workflows.find((item) => item.taskCardId === task.id);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  job={job}
                  workflow={workflow}
                  isExpanded={expandedTaskId === task.id}
                  isRunning={jobBusyId === task.id}
                  onToggle={() => toggleTask(task.id)}
                  onStart={() => confirmAndStart(task)}
                  onDone={() => completeTask(task.id)}
                  onArchive={() => archiveTask(task.id)}
                  onRestore={() => restoreTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                  onUpdate={(patch) => updateTask(task.id, patch)}
                  onToggleWorkflowItem={toggleWorkflowItem}
                  onUpdateTaxWorkflow={updateTaxWorkflow}
                  onStartTaxSession={startTaxSession}
                  onAdvanceTaxSession={advanceTaxSession}
                  onResetTaxSession={resetTaxFilingSession}
                  onPrepareBrowserHandoff={prepareBrowserHandoff}
                  onRequestBrowserExecution={requestBrowserExecution}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Horizon filter toggle */}
      {mobileTab === "active" && (
        <div className="horizon-toggle">
          {(["all", "today", "weekend", "this-week"] as const).map((h) => (
            <button
              key={h}
              className={`horizon-btn${horizonFilter === h ? " active" : ""}`}
              onClick={() => {
                setHorizonFilter(h);
                if (h !== "today") setScheduleViewActive(false);
              }}
            >
              {h === "all" ? "All" : h === "today" ? "Today" : h === "weekend" ? "Weekend" : "This Week"}
            </button>
          ))}
        </div>
      )}

      {/* List | Schedule toggle — only visible under Today filter */}
      {mobileTab === "active" && horizonFilter === "today" && (
        <div className="schedule-mode-toggle">
          <button
            className={`schedule-mode-btn${!scheduleViewActive ? " active" : ""}`}
            onClick={() => setScheduleViewActive(false)}
          >
            List
          </button>
          <button
            className={`schedule-mode-btn${scheduleViewActive ? " active" : ""}`}
            onClick={() => setScheduleViewActive(true)}
          >
            Schedule
          </button>
        </div>
      )}

      {/* Schedule view — replaces task sections when active */}
      {mobileTab === "active" && scheduleViewActive && horizonFilter === "today" && (
        <ScheduleView
          tasks={[...filteredInProgressTasks, ...filteredPendingTasks].filter(
            (t) => t.horizon === "today",
          )}
          onUpdate={(taskId, patch) => updateTask(taskId, patch)}
        />
      )}

      {/* Flat list — default view */}
      {mobileTab === "active" && !bucketViewActive && !scheduleViewActive && flatActiveTasks.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>Tasks</span>
            <span className="count-badge">{flatActiveTasks.length}</span>
          </div>
          <div className="task-list">
            {flatActiveTasks.map((task) => {
              const job = jobs.find((j) => j.taskCardId === task.id);
              const workflow = workflows.find((item) => item.taskCardId === task.id);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  job={job}
                  workflow={workflow}
                  isExpanded={expandedTaskId === task.id}
                  isRunning={jobBusyId === task.id}
                  onToggle={() => toggleTask(task.id)}
                  onStart={() => confirmAndStart(task)}
                  onDone={() => completeTask(task.id)}
                  onArchive={() => archiveTask(task.id)}
                  onRestore={() => restoreTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                  onUpdate={(patch) => updateTask(task.id, patch)}
                  onToggleWorkflowItem={toggleWorkflowItem}
                  onUpdateTaxWorkflow={updateTaxWorkflow}
                  onStartTaxSession={startTaxSession}
                  onAdvanceTaxSession={advanceTaxSession}
                  onResetTaxSession={resetTaxFilingSession}
                  onPrepareBrowserHandoff={prepareBrowserHandoff}
                  onRequestBrowserExecution={requestBrowserExecution}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Organized backlog */}
      {mobileTab === "active" && !scheduleViewActive && bucketViewActive && pendingBuckets.length > 0 && (
        <section className="task-section">
          <div className="section-header">
            <span>Organized Backlog</span>
            <span className="count-badge">{filteredPendingTasks.length}</span>
          </div>
          <div className="bucket-stack">
            {pendingBuckets.map((bucket) => (
              <section className="bucket-section" key={bucket.key}>
                <div className="bucket-header">
                  <div>
                    <div className="bucket-title">{bucket.label}</div>
                    <p className="bucket-copy">{bucket.description}</p>
                    {rankTopReason?.bucketKey === bucket.key && (
                      <p className="rank-reason">✨ {rankTopReason.reason}</p>
                    )}
                  </div>
                  <div className="bucket-header-actions">
                    <button
                      className="rank-btn"
                      disabled={rankingBucket === bucket.key}
                      onClick={() => void rankBucket(bucket)}
                    >
                      {rankingBucket === bucket.key ? "Ranking…" : "✨ Rank"}
                    </button>
                    <span className="count-badge">{bucket.tasks.length}</span>
                  </div>
                </div>
                <div className="task-list">
                  {bucket.tasks.map((task, taskIdx) => {
                    const job = jobs.find((j) => j.taskCardId === task.id);
                    const workflow = workflows.find((item) => item.taskCardId === task.id);
                    return (
                      <TaskItem
                        key={task.id}
                        task={task}
                        job={job}
                        workflow={workflow}
                        isExpanded={expandedTaskId === task.id}
                        isRunning={jobBusyId === task.id}
                        onToggle={() => toggleTask(task.id)}
                        onStart={() => confirmAndStart(task)}
                        onDone={() => completeTask(task.id)}
                        onArchive={() => archiveTask(task.id)}
                        onRestore={() => restoreTask(task.id)}
                        onDelete={() => deleteTask(task.id)}
                        onUpdate={(patch) => updateTask(task.id, patch)}
                        onToggleWorkflowItem={toggleWorkflowItem}
                        onUpdateTaxWorkflow={updateTaxWorkflow}
                        onStartTaxSession={startTaxSession}
                        onAdvanceTaxSession={advanceTaxSession}
                        onResetTaxSession={resetTaxFilingSession}
                        onPrepareBrowserHandoff={prepareBrowserHandoff}
                        onRequestBrowserExecution={requestBrowserExecution}
                        onMoveUp={taskIdx > 0 ? () => reorderTaskInBucket(bucket.tasks, task.id, "up") : undefined}
                        onMoveDown={taskIdx < bucket.tasks.length - 1 ? () => reorderTaskInBucket(bucket.tasks, task.id, "down") : undefined}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {mobileTab === "active" && !scheduleViewActive && (
        bucketViewActive
          ? filteredInProgressTasks.length === 0 && filteredPendingTasks.length === 0
          : flatActiveTasks.length === 0
      ) && (
        <div className="empty-hint">Nothing here yet. Add something above.</div>
      )}

      {/* Think tab */}
      {mobileTab === "think" && (
        <section className="content-section">
          <div className="think-input-wrap">
            <textarea
              className="think-textarea"
              placeholder={"What's on your mind? Dump tasks, think out loud, or ask Claude anything.\n\nClaude will extract actionable items and rank them by time."}
              value={thinkInput}
              onChange={(e) => setThinkInput(e.target.value)}
            />
            <button
              className="button"
              disabled={!thinkInput.trim() || thinkBusy}
              onClick={() => void submitThinkEntry()}
            >
              {thinkBusy ? "Thinking..." : "Submit"}
            </button>
          </div>

          {pendingThinkEntry && (
            <article className="think-entry" style={{ marginTop: 12 }}>
              <div className="think-entry-response">{pendingThinkEntry.claudeResponse}</div>
              {pendingThinkEntry.extractedTasks.length > 0 && (
                <div className="think-extracted-tasks">
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>
                    Tasks found — uncheck any you don&apos;t want:
                  </div>
                  {pendingThinkEntry.extractedTasks.map((t, i) => (
                    <label key={i} className="think-extracted-task">
                      <input
                        type="checkbox"
                        checked={pendingTaskChecks[i] ?? true}
                        onChange={(e) =>
                          setPendingTaskChecks((checks) =>
                            checks.map((c, j) => (j === i ? e.target.checked : c)),
                          )
                        }
                      />
                      <span>
                        <strong>{t.title}</strong>
                        <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: "0.8rem" }}>({t.complexity})</span>
                        <br />
                        <span style={{ color: "var(--muted)" }}>{t.context}</span>
                      </span>
                    </label>
                  ))}
                  <button className="button" style={{ marginTop: 6 }} onClick={confirmThinkTasks}>
                    Add {pendingTaskChecks.filter(Boolean).length} task{pendingTaskChecks.filter(Boolean).length !== 1 ? "s" : ""}
                  </button>
                </div>
              )}
              {pendingThinkEntry.extractedTasks.length === 0 && (
                <button
                  className="button"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    setThinkEntries((current) => [pendingThinkEntry, ...current]);
                    setPendingThinkEntry(null);
                  }}
                >
                  Save entry
                </button>
              )}
            </article>
          )}

          {thinkEntries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              <div className="section-header"><span>Past entries</span></div>
              {thinkEntries.map((entry) => (
                <article key={entry.id} className="think-entry">
                  <div className="think-entry-date">
                    {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                  <div className="think-entry-text">
                    {entry.text.length > 120 ? entry.text.slice(0, 120) + "…" : entry.text}
                  </div>
                  {entry.claudeResponse && (
                    <div className="think-entry-response">{entry.claudeResponse}</div>
                  )}
                  {entry.confirmedTaskIds.length > 0 && (
                    <div className="think-confirmed-chips">
                      {entry.confirmedTaskIds.map((id) => {
                        const task = tasks.find((t) => t.id === id);
                        return task ? <span key={id} className="think-confirmed-chip">{task.title}</span> : null;
                      })}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Done — collapsible, tap to see results */}
      {mobileTab === "done" && filteredDoneTasks.length > 0 && (
        <section className="ideas-section">
          <button className="section-toggle" onClick={() => setDoneExpanded((v) => !v)}>
            <span>Done</span>
            <span className="count-badge">{filteredDoneTasks.length}</span>
            <span className="toggle-arrow">{doneExpanded ? "↑" : "↓"}</span>
          </button>
          {doneExpanded && (
            <div className="task-list">
              {filteredDoneTasks.map((task) => {
                const job = jobs.find((j) => j.taskCardId === task.id);
                const workflow = workflows.find((item) => item.taskCardId === task.id);
                return (
                  <TaskItem
                    key={task.id}
                    task={task}
                    job={job}
                    workflow={workflow}
                    isExpanded={expandedTaskId === task.id}
                    isRunning={false}
                    onToggle={() => toggleTask(task.id)}
                    onStart={() => confirmAndStart(task)}
                    onDone={() => completeTask(task.id)}
                    onArchive={() => archiveTask(task.id)}
                    onRestore={() => restoreTask(task.id)}
                    onDelete={() => deleteTask(task.id)}
                    onUpdate={(patch) => updateTask(task.id, patch)}
                    onToggleWorkflowItem={toggleWorkflowItem}
                    onUpdateTaxWorkflow={updateTaxWorkflow}
                    onStartTaxSession={startTaxSession}
                    onAdvanceTaxSession={advanceTaxSession}
                    onResetTaxSession={resetTaxFilingSession}
                    onPrepareBrowserHandoff={prepareBrowserHandoff}
                    onRequestBrowserExecution={requestBrowserExecution}
                    onReopen={() => reopenTask(task.id)}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {mobileTab === "done" && filteredDoneTasks.length === 0 && (
        <div className="empty-hint">No done items in this filter.</div>
      )}

      {mobileTab === "done" && filteredArchivedTasks.length > 0 && (
        <section className="ideas-section">
          <button className="section-toggle" onClick={() => setDoneExpanded((v) => !v)}>
            <span>Archived</span>
            <span className="count-badge">{filteredArchivedTasks.length}</span>
            <span className="toggle-arrow">{doneExpanded ? "↑" : "↓"}</span>
          </button>
          {doneExpanded && filteredArchivedTasks.length > 0 && (
            <div className="task-list">
              {filteredArchivedTasks.map((task) => {
                const job = jobs.find((j) => j.taskCardId === task.id);
                const workflow = workflows.find((item) => item.taskCardId === task.id);
                return (
                  <TaskItem
                    key={task.id}
                    task={task}
                    job={job}
                    workflow={workflow}
                    isExpanded={expandedTaskId === task.id}
                    isRunning={false}
                    onToggle={() => toggleTask(task.id)}
                    onStart={() => confirmAndStart(task)}
                    onDone={() => completeTask(task.id)}
                    onArchive={() => archiveTask(task.id)}
                    onRestore={() => restoreTask(task.id)}
                    onDelete={() => deleteTask(task.id)}
                    onUpdate={(patch) => updateTask(task.id, patch)}
                    onToggleWorkflowItem={toggleWorkflowItem}
                    onUpdateTaxWorkflow={updateTaxWorkflow}
                    onStartTaxSession={startTaxSession}
                    onAdvanceTaxSession={advanceTaxSession}
                    onResetTaxSession={resetTaxFilingSession}
                    onPrepareBrowserHandoff={prepareBrowserHandoff}
                    onRequestBrowserExecution={requestBrowserExecution}
                  />
                );
              })}
            </div>
          )}
          {doneExpanded && filteredArchivedTasks.length === 0 && (
            <div className="empty-hint">No archived items in this filter.</div>
          )}
        </section>
      )}

      {/* Ideas — collapsible */}
      {mobileTab === "ideas" && ideas.length > 0 && (
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
                  <div className="idea-actions">
                    <button className="ghost-button sm" onClick={() => convertIdea(idea)}>
                      Add this
                    </button>
                    <button className="ghost-button sm danger-button" onClick={() => deleteIdea(idea.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {mobileTab === "ideas" && ideas.length === 0 && (
        <div className="empty-hint">No ideas saved right now.</div>
      )}
    </main>
  );
}
