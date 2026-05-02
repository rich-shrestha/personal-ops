# Active Tab Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four improvements to the Active tab: a General/Other catch-all bucket, manual + AI rank ordering within buckets, a time-horizon filter (Today / Weekend / This Week / Someday), and inline collapsible notes on each task card.

**Architecture:** Three new nullable columns (`notes`, `sort_order`, `horizon`) are added to `task_cards` via migration. `TaskCard` type gains matching optional fields. The state-store load/save is updated to map them. A new `/api/rank-tasks` route calls Claude with a bucket's tasks and returns a ranked order + one-line reason. All UI lives in `components/personal-ops-app.tsx` — the "Other" bucket already exists at the bottom of the bucket array (no structural change needed for Feature 1); Features 2–4 add new state variables, helper functions, and JSX inline to the existing component.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/supabase-js`), Anthropic SDK (`@anthropic-ai/sdk`), React 18, Tailwind + custom CSS (globals.css)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/migrations/20260502000000_add_task_enhancements.sql` | Create | Add `notes`, `sort_order`, `horizon` columns to `task_cards` |
| `lib/types.ts` | Modify | Add `TaskHorizon` type; add `notes`, `sortOrder`, `horizon` to `TaskCard` |
| `lib/server/state-store.ts` | Modify | Map new columns in `loadAppState`; include in `taskRows` in `saveAppState` |
| `app/api/rank-tasks/route.ts` | Create | POST endpoint — calls Claude to rank a bucket's tasks by priority |
| `components/personal-ops-app.tsx` | Modify | All UI: sort order buttons, AI rank button, horizon filter toggle + pills, notes area |
| `app/globals.css` | Modify | Add styles for horizon pills, notes area, rank/reorder buttons |

---

## Task 1: DB Migration — add `notes`, `sort_order`, `horizon`

**Files:**
- Create: `supabase/migrations/20260502000000_add_task_enhancements.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260502000000_add_task_enhancements.sql
alter table public.task_cards
  add column if not exists notes text,
  add column if not exists sort_order integer,
  add column if not exists horizon text check (horizon in ('today', 'weekend', 'this-week', 'someday'));
```

- [ ] **Step 2: Verify migration file parses correctly (quick sanity check)**

```bash
cat supabase/migrations/20260502000000_add_task_enhancements.sql
```

Expected: file prints with three ALTER TABLE statements and no syntax errors visible.

---

## Task 2: Update `TaskCard` type

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `TaskHorizon` type and new fields to `TaskCard`**

In `lib/types.ts`, after line 4 (`export type TaskArea = ...`), add:

```ts
export type TaskHorizon = "today" | "weekend" | "this-week" | "someday";
```

Then extend the `TaskCard` interface (currently lines 26–39) with three new optional fields after `dueDate`:

```ts
export interface TaskCard {
  id: string;
  title: string;
  context: string;
  area: TaskArea;
  category: TaskCategory;
  complexity: TaskComplexity;
  status: TaskStatus;
  archivedAt?: string;
  dueDate?: string;
  notes?: string;
  sortOrder?: number;
  horizon?: TaskHorizon;
  sourceCaptureId: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles (no new errors from type change)**

```bash
cd /path/to/worktree && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero new errors related to `TaskCard` or `TaskHorizon`.

---

## Task 3: Update state-store load + save

**Files:**
- Modify: `lib/server/state-store.ts`

- [ ] **Step 1: Update `loadAppState` — map new DB columns onto `TaskCard`**

In `loadAppState`, find the `tasks` mapping (currently lines 79–92). Replace it with:

```ts
const VALID_HORIZONS = new Set<string>(["today", "weekend", "this-week", "someday"]);

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
  horizon: VALID_HORIZONS.has(row.horizon as string)
    ? (row.horizon as TaskCard["horizon"])
    : undefined,
  sourceCaptureId: row.source_capture_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));
```

Place `VALID_HORIZONS` as a module-level constant just before `loadAppState` (above the `export async function loadAppState` line).

- [ ] **Step 2: Update `saveAppState` — include new fields in `taskRows`**

In `saveAppState`, find the `taskRows` mapping (lines 182–195). Replace it with:

```ts
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
  horizon: task.horizon ?? null,
  source_capture_id: captureIdSet.has(task.sourceCaptureId) ? task.sourceCaptureId : null,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
}));
```

The `legacyTaskRows` (lines 196–207) does NOT need the new columns — it's a fallback for old schemas without `area`/`archived_at`. Leave it unchanged.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

---

## Task 4: Create `/api/rank-tasks` route

**Files:**
- Create: `app/api/rank-tasks/route.ts`

- [ ] **Step 1: Create route file**

```ts
// app/api/rank-tasks/route.ts
import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import Anthropic from "@anthropic-ai/sdk";

interface RankRequest {
  tasks: { id: string; title: string; context: string }[];
}

interface RankResponse {
  rankedIds: string[];
  topReason: string;
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as RankRequest;
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];

  if (tasks.length === 0) {
    return NextResponse.json({ rankedIds: [], topReason: "" } satisfies RankResponse);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: return tasks in original order with a placeholder reason
    return NextResponse.json({
      rankedIds: tasks.map((t) => t.id),
      topReason: "No AI key configured — order unchanged.",
    } satisfies RankResponse);
  }

  const client = new Anthropic({ apiKey });

  const taskList = tasks
    .map((t, i) => `${i + 1}. ID: ${t.id}\n   Title: ${t.title}\n   Context: ${t.context || "(none)"}`)
    .join("\n\n");

  const prompt = `Rank these tasks by urgency and impact. Return only valid JSON with two keys:
- "rankedIds": array of task IDs, highest priority first
- "topReason": one sentence explaining why the first task is most urgent

Tasks:
${taskList}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const result = extractJson(text) as RankResponse;

  return NextResponse.json({
    rankedIds: Array.isArray(result.rankedIds) ? result.rankedIds : tasks.map((t) => t.id),
    topReason: typeof result.topReason === "string" ? result.topReason : "",
  } satisfies RankResponse);
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

---

## Task 5: Feature 1 — "Other" bucket (verify + label fix)

**Files:**
- Modify: `components/personal-ops-app.tsx`

**Context:** The "Other" bucket (`key: "other"`) already exists as the last entry in `buildTaskBuckets` and `inferTaskBucket` already returns `"other"` as the final fallback for non-admin tasks. No structural change is needed. This task verifies the label and ensures the bucket renders correctly.

- [ ] **Step 1: Confirm "Other" bucket definition in `buildTaskBuckets` (lines 205–223)**

Check that the last bucket entry in the `buckets` array reads:

```ts
{ key: "other", label: "Other", description: "Everything that does not fit a repeat bucket yet.", tasks: [] },
```

If the label or description differ, update them to match the above. No other changes to this function in this task.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260502000000_add_task_enhancements.sql lib/types.ts lib/server/state-store.ts app/api/rank-tasks/route.ts components/personal-ops-app.tsx
git commit -m "feat: add task_cards columns (notes, sort_order, horizon) + rank-tasks API"
```

---

## Task 6: Feature 2 — Sort order: `buildTaskBuckets` + reorder handler

**Files:**
- Modify: `components/personal-ops-app.tsx`

- [ ] **Step 1: Sort bucket tasks by `sortOrder` in `buildTaskBuckets`**

In `buildTaskBuckets` (lines 205–223), after the `for` loop that assigns tasks to buckets and before the `return` statement, add:

```ts
for (const bucket of buckets) {
  bucket.tasks.sort((a, b) => {
    if (a.sortOrder === undefined && b.sortOrder === undefined) return 0;
    if (a.sortOrder === undefined) return 1;
    if (b.sortOrder === undefined) return -1;
    return a.sortOrder - b.sortOrder;
  });
}
```

This keeps the existing `sortTasksForDisplay` order for tasks with no explicit `sortOrder` and puts manually-sorted tasks first in their assigned slot.

- [ ] **Step 2: Add `reorderTaskInBucket` function to the component**

Inside `PersonalOpsApp` (the main component function), after the `updateTask` function (around line 984), add:

```ts
function reorderTaskInBucket(
  bucketTasks: TaskCard[],
  taskId: string,
  direction: "up" | "down",
) {
  const idx = bucketTasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= bucketTasks.length) return;

  // Assign sort orders based on current display positions if not yet set
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
```

- [ ] **Step 3: Add `onMoveUp` and `onMoveDown` props to `TaskItem`**

In the `TaskItem` function signature (lines 227–275), add two optional props to the props type:

```ts
onMoveUp?: () => void;
onMoveDown?: () => void;
```

Add them to the destructured parameter list at the top of the function.

- [ ] **Step 4: Render up/down buttons inside `TaskItem`**

In the `TaskItem` JSX, find the `<button className="task-row" onClick={onToggle}>` block (line ~292). Directly **after** the closing `</button>` of `task-row` and **before** `{isExpanded && (<div className="task-body">`, insert:

```tsx
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
```

- [ ] **Step 5: Wire up `onMoveUp`/`onMoveDown` in the bucket rendering loop**

In the "Organized backlog" section (lines ~1688–1716), the bucket task list renders `<TaskItem ... />` for each task. Wrap the `TaskItem` call with the handler:

```tsx
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
```

Note: change the existing `bucket.tasks.map((task) => {` to `bucket.tasks.map((task, taskIdx) => {`.

---

## Task 7: Feature 2 — AI rank button

**Files:**
- Modify: `components/personal-ops-app.tsx`

- [ ] **Step 1: Add `rankingBucket` state**

Near the other `useState` declarations (around line 660), add:

```ts
const [rankingBucket, setRankingBucket] = useState<TaskBucketKey | null>(null);
const [rankTopReason, setRankTopReason] = useState<{ bucketKey: TaskBucketKey; reason: string } | null>(null);
```

- [ ] **Step 2: Add `rankBucket` function**

After `reorderTaskInBucket` (added in Task 6), add:

```ts
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
    // Assign sortOrder based on returned rank (0, 1000, 2000, ...)
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
```

- [ ] **Step 3: Add ✨ Rank button to bucket header**

In the bucket header JSX (lines ~1681–1687):

```tsx
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
```

- [ ] **Step 4: Commit**

```bash
git add components/personal-ops-app.tsx
git commit -m "feat: sort order + AI rank buttons for bucket tasks"
```

---

## Task 8: Feature 3 — Time-horizon filter toggle

**Files:**
- Modify: `components/personal-ops-app.tsx`

- [ ] **Step 1: Add `horizonFilter` state**

Near the other `useState` declarations (around line 660), add:

```ts
const [horizonFilter, setHorizonFilter] = useState<"all" | TaskHorizon>("all");
```

Also add `TaskHorizon` to the import from `@/lib/types` at the top of the file. Find the existing import line and add it:

```ts
import { ..., TaskHorizon } from "@/lib/types";
```

- [ ] **Step 2: Apply horizon filter to `filteredPendingTasks`**

Find the `filteredPendingTasks` `useMemo` (lines 867–871) and update it:

```ts
const filteredPendingTasks = useMemo(
  () =>
    pendingTasks
      .filter((task) => matchesArea(task))
      .filter((task) => horizonFilter === "all" || task.horizon === horizonFilter),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [areaToggle, pendingTasks, horizonFilter],
);
```

- [ ] **Step 3: Add horizon filter toggle UI**

The Active tab renders an "Organized Backlog" section header (lines ~1672–1677). Directly **before** that section (between line ~1670 and the `{mobileTab === "active" && pendingBuckets.length > 0 && (` block), insert the horizon filter:

```tsx
{mobileTab === "active" && (
  <div className="horizon-toggle">
    {(["all", "today", "weekend", "this-week"] as const).map((h) => (
      <button
        key={h}
        className={`horizon-btn${horizonFilter === h ? " active" : ""}`}
        onClick={() => setHorizonFilter(h)}
      >
        {h === "all" ? "All" : h === "today" ? "Today" : h === "weekend" ? "Weekend" : "This Week"}
      </button>
    ))}
  </div>
)}
```

---

## Task 9: Feature 3 — Horizon pill on task cards

**Files:**
- Modify: `components/personal-ops-app.tsx`

**Context:** The horizon pill lives on each task card and lets users tap to cycle through horizons. It should be visible on collapsed cards (not hidden in the expanded `task-body`).

- [ ] **Step 1: Add `onUpdateHorizon` prop to `TaskItem` (or use `onUpdate`)**

`TaskItem` already accepts `onUpdate: (patch: Partial<TaskCard>) => void`. No new prop is needed — calling `onUpdate({ horizon: nextHorizon })` is sufficient.

- [ ] **Step 2: Add horizon pill to `TaskItem` JSX**

In `TaskItem`, find the task-row button block. Inside `<div className="task-summary">`, after the `<span className="task-title-row">` block (which contains the title and scope pill), add the horizon pill:

```tsx
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
  {task.horizon === "today" ? "Today" :
   task.horizon === "weekend" ? "Weekend" :
   task.horizon === "this-week" ? "This Week" :
   "Someday"}
</span>
```

- [ ] **Step 3: Set default horizon for newly created tasks**

In the component, find where new tasks are constructed and pushed into state. Search for `addTask` or the inline task add handler. When a new `TaskCard` is created (look for `uid()` + object construction), set `horizon: "someday"` in the initial object.

Search for `sourceCaptureId: draftSourceId` or similar — the draft confirmation flow in `confirmDraft` (around line 950+). In the new task object being constructed there, add `horizon: "someday"` as a field.

- [ ] **Step 4: Commit**

```bash
git add components/personal-ops-app.tsx
git commit -m "feat: time-horizon filter toggle + horizon pills on task cards"
```

---

## Task 10: Feature 4 — Inline notes on task cards

**Files:**
- Modify: `components/personal-ops-app.tsx`

- [ ] **Step 1: Add `isEditingNotes` local state inside `TaskItem`**

At the top of the `TaskItem` function body (just after the `taxWorkflow` constant, around line 276), add:

```ts
const [isEditingNotes, setIsEditingNotes] = useState(false);
const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
```

Make sure `useState` is already imported from React (it is).

- [ ] **Step 2: Sync `noteDraft` when task notes change externally**

After the two `useState` lines above, add:

```ts
// Keep draft in sync when task.notes changes externally (e.g., initial load)
// eslint-disable-next-line react-hooks/exhaustive-deps
React.useEffect(() => { setNoteDraft(task.notes ?? ""); }, [task.id]);
```

- [ ] **Step 3: Add notes section to `TaskItem` JSX**

After the `task-reorder-btns` block (from Task 6) and before `{isExpanded && (<div className="task-body">`, insert the notes section:

```tsx
{/* Notes: preview when collapsed, editor when editing */}
<div className="task-notes-area">
  {isEditingNotes ? (
    <div className="notes-editor">
      <textarea
        className="notes-textarea"
        rows={3}
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        placeholder="Add context, links, or reminders…"
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
      className="notes-preview"
      onClick={(e) => { e.stopPropagation(); setIsEditingNotes(true); }}
    >
      📝 {task.notes.length > 60 ? `${task.notes.slice(0, 60)}…` : task.notes}
    </button>
  ) : (
    <button
      className="notes-add-btn"
      onClick={(e) => { e.stopPropagation(); setIsEditingNotes(true); }}
    >
      📝 Add note
    </button>
  )}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add components/personal-ops-app.tsx
git commit -m "feat: inline collapsible notes on task cards"
```

---

## Task 11: Add CSS for new UI elements

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add styles for all new elements**

At the end of `app/globals.css`, append:

```css
/* ── Bucket rank button ──────────────────────────────────────────────────── */
.bucket-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.rank-btn {
  font-size: 0.72rem;
  padding: 3px 8px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  white-space: nowrap;
}
.rank-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.rank-reason {
  font-size: 0.72rem;
  color: var(--muted);
  margin: 2px 0 0;
  font-style: italic;
}

/* ── Reorder buttons ─────────────────────────────────────────────────────── */
.task-reorder-btns {
  display: flex;
  gap: 4px;
  padding: 2px 12px;
}

.reorder-btn {
  font-size: 0.65rem;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
}
.reorder-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ── Horizon filter toggle ───────────────────────────────────────────────── */
.horizon-toggle {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.horizon-btn {
  font-size: 0.78rem;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.horizon-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* ── Horizon pills on task cards ─────────────────────────────────────────── */
.horizon-pill {
  display: inline-block;
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  margin-left: 4px;
  vertical-align: middle;
}
.horizon-today    { background: #fef3c7; color: #92400e; }
.horizon-weekend  { background: #dbeafe; color: #1e40af; }
.horizon-this-week { background: #d1fae5; color: #065f46; }
.horizon-someday  { background: var(--surface); color: var(--muted); border: 1px solid var(--border); }

/* ── Task notes area ─────────────────────────────────────────────────────── */
.task-notes-area {
  padding: 0 12px 6px;
}

.notes-add-btn,
.notes-preview {
  font-size: 0.75rem;
  color: var(--muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  display: block;
  width: 100%;
}
.notes-preview {
  color: var(--fg);
}

.notes-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notes-textarea {
  width: 100%;
  font-size: 0.82rem;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--fg);
  resize: vertical;
  font-family: inherit;
}

.notes-actions {
  display: flex;
  gap: 8px;
}

.notes-save-btn,
.notes-cancel-btn {
  font-size: 0.75rem;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--border);
}
.notes-save-btn {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.notes-cancel-btn {
  background: transparent;
  color: var(--muted);
}
```

- [ ] **Step 2: Commit CSS**

```bash
git add app/globals.css
git commit -m "style: add CSS for horizon pills, notes area, rank/reorder buttons"
```

---

## Task 12: Build verification + deploy

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: build completes with zero TypeScript errors and zero Next.js build errors. Fix any errors before continuing.

- [ ] **Step 2: Push to main and deploy**

```bash
git push origin claude/gracious-mendeleev-5d9498:main
vercel --prod
```

Expected: Vercel deployment succeeds and the live URL is printed.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Feature 1 (Other bucket at bottom) — bucket already exists at position 8; Task 5 verifies label/description
- [x] Feature 2 (Manual reorder) — Tasks 6: up/down buttons wired to `reorderTaskInBucket`
- [x] Feature 2 (AI rank button) — Tasks 4 + 7: `/api/rank-tasks` route + "✨ Rank" per bucket header
- [x] Feature 2 (top-item reason) — `topReason` surfaced below bucket title in rank result
- [x] Feature 3 (All/Today/Weekend/This Week toggle) — Task 8: `horizonFilter` state + toggle UI
- [x] Feature 3 (horizon pill on cards, tap to cycle) — Task 9: pill cycles Today→Weekend→This Week→Someday
- [x] Feature 3 (default new tasks to Someday) — Task 9 Step 3: `horizon: "someday"` in new task objects
- [x] Feature 4 (collapsible notes area) — Task 10: inline textarea, preview, add-note button
- [x] Feature 4 (notes column in Supabase) — Task 1: migration adds `notes text`
- [x] Feature 4 (first 60-char preview) — Task 10 Step 3: `task.notes.slice(0, 60)` preview
- [x] Mobile-first — all new controls use `flex`, appropriate tap targets, `overflow-x: auto` for horizon toggle
- [x] Build verification — Task 12

**No TDD steps** — this project has no test framework configured; build verification (`npx tsc --noEmit` + `npm run build`) is the quality gate instead.
