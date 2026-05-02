# Day Schedule View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-blocking schedule view inside the "Today" horizon filter on the Active tab — a vertical timeline (7am–10pm) where users tap to assign Today tasks to hourly slots (expandable to 30-min sub-slots), with persistence via a `scheduled_time` DB column.

**Architecture:** New `ScheduleView` component renders a two-panel layout: an unscheduled task tray on top and a scrollable timeline below. Selection state (`selectedTaskId`) lives in the component. A "List | Schedule" toggle appears beneath the horizon filter only when `horizonFilter === "today"`. The `scheduledTime` field flows through types → state-store → DB in the same snake/camel pattern as `sortOrder` and `horizon`.

**Tech Stack:** React (useState), Next.js App Router, Supabase (via existing state-store), CSS custom properties (globals.css)

---

### Task 1: DB migration — add `scheduled_time` column

**Files:**
- Create: `supabase/migrations/20260502010000_add_scheduled_time.sql`

- [ ] Create migration file:

```sql
alter table public.task_cards
  add column if not exists scheduled_time text;
```

- [ ] Paste and run this SQL in the Supabase dashboard SQL editor (or confirm already done).

- [ ] Commit:

```bash
git add supabase/migrations/20260502010000_add_scheduled_time.sql
git commit -m "feat: add scheduled_time column to task_cards"
```

---

### Task 2: Add `scheduledTime` to TypeScript types

**Files:**
- Modify: `lib/types.ts` — add field to `TaskCard` interface

- [ ] Add `scheduledTime?: string;` to the `TaskCard` interface after `horizon`:

```typescript
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
  scheduledTime?: string;   // "HH:MM", e.g. "09:00" or "14:30"
  sourceCaptureId: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] Commit:

```bash
git add lib/types.ts
git commit -m "feat: add scheduledTime field to TaskCard type"
```

---

### Task 3: Wire `scheduled_time` through state-store

**Files:**
- Modify: `lib/server/state-store.ts` — read at ~line 91, write at ~line 199

- [ ] In the DB→TS mapper (around line 91, where `notes` and `sortOrder` are mapped), add:

```typescript
scheduledTime: typeof row.scheduled_time === "string" ? row.scheduled_time : undefined,
```

- [ ] In the TS→DB mapper (around line 199, where `sort_order` and `horizon` are written), add:

```typescript
scheduled_time: task.scheduledTime ?? null,
```

- [ ] Run TypeScript check:

```bash
cd /Users/richshrestha/Documents/Projects/personal-ops && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `scheduledTime`.

- [ ] Commit:

```bash
git add lib/server/state-store.ts
git commit -m "feat: map scheduled_time through state-store"
```

---

### Task 4: Build `ScheduleView` component

**Files:**
- Create: `components/schedule-view.tsx`
- Modify: `app/globals.css` — add schedule view styles

**Design:**
- Top panel: horizontal-scroll chip tray of Today tasks that have no `scheduledTime`
- Bottom panel: vertical list of 15 time slots (7:00–21:00, 1-hour each)
- Each slot can be expanded (state: `expandedSlot: string | null`) to show 30-min sub-slots
- Interaction: tap a task chip → it becomes `selectedTaskId`; tap a slot → assign that time; tap scheduled block → unschedule
- `scheduled_time` format: `"HH:MM"` 24h (e.g., `"07:00"`, `"14:30"`)

- [ ] Create `components/schedule-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { TaskCard } from "@/lib/types";

interface ScheduleViewProps {
  tasks: TaskCard[];
  onUpdate: (taskId: string, patch: Partial<TaskCard>) => void;
}

const HOUR_SLOTS = Array.from({ length: 15 }, (_, i) => i + 7); // 7..21

function fmtHour(h: number) {
  if (h === 12) return "12 pm";
  if (h < 12) return `${h} am`;
  return `${h - 12} pm`;
}

function fmtHalf(h: number, half: 0 | 1) {
  const base = fmtHour(h).replace(" am", "").replace(" pm", "");
  const suffix = h < 12 ? " am" : " pm";
  return half === 0 ? `${base}:00${suffix}` : `${base}:30${suffix}`;
}

function toKey(h: number, half: 0 | 1 = 0) {
  return `${String(h).padStart(2, "0")}:${half === 0 ? "00" : "30"}`;
}

export default function ScheduleView({ tasks, onUpdate }: ScheduleViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  const unscheduled = tasks.filter((t) => !t.scheduledTime);
  const scheduled = tasks.filter((t) => t.scheduledTime);

  function assignSlot(timeKey: string) {
    if (!selectedTaskId) return;
    onUpdate(selectedTaskId, { scheduledTime: timeKey });
    setSelectedTaskId(null);
    setExpandedSlot(null);
  }

  function unscheduleTask(taskId: string) {
    onUpdate(taskId, { scheduledTime: undefined });
  }

  function taskAtSlot(timeKey: string) {
    return scheduled.find((t) => t.scheduledTime === timeKey);
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="schedule-view">
      {/* Unscheduled tray */}
      <div className="schedule-tray">
        {unscheduled.length === 0 ? (
          <span className="schedule-tray-empty">All tasks scheduled</span>
        ) : (
          unscheduled.map((task) => (
            <button
              key={task.id}
              className={`schedule-chip${selectedTaskId === task.id ? " selected" : ""}`}
              onClick={() =>
                setSelectedTaskId(selectedTaskId === task.id ? null : task.id)
              }
            >
              {task.title.length > 28 ? task.title.slice(0, 27) + "…" : task.title}
            </button>
          ))
        )}
      </div>

      {selectedTask && (
        <div className="schedule-hint">
          Tap a time slot to schedule <strong>{selectedTask.title.length > 20 ? selectedTask.title.slice(0, 19) + "…" : selectedTask.title}</strong>
        </div>
      )}

      {/* Timeline */}
      <div className="schedule-timeline">
        {HOUR_SLOTS.map((h) => {
          const key = toKey(h);
          const keyHalf = toKey(h, 1);
          const isExpanded = expandedSlot === h;
          const blockFull = taskAtSlot(key);
          const blockHalf = taskAtSlot(keyHalf);

          return (
            <div key={h} className="schedule-slot-group">
              {/* Hour slot */}
              <div
                className={`schedule-slot${blockFull ? " occupied" : ""}${selectedTaskId && !blockFull ? " droppable" : ""}`}
                onClick={() => {
                  if (blockFull) {
                    unscheduleTask(blockFull.id);
                  } else if (selectedTaskId) {
                    assignSlot(key);
                  } else {
                    setExpandedSlot(isExpanded ? null : h);
                  }
                }}
              >
                <span className="slot-label">{fmtHour(h)}</span>
                {blockFull ? (
                  <span className="slot-task-block">
                    {blockFull.title.length > 30
                      ? blockFull.title.slice(0, 29) + "…"
                      : blockFull.title}
                    <span className="slot-remove">✕</span>
                  </span>
                ) : (
                  <span className="slot-expand-hint">
                    {isExpanded ? "▲" : selectedTaskId ? "Assign" : "▾"}
                  </span>
                )}
              </div>

              {/* 30-min sub-slots (expanded) */}
              {isExpanded && !blockFull && (
                <>
                  <div
                    className={`schedule-slot sub-slot${selectedTaskId ? " droppable" : ""}`}
                    onClick={() => selectedTaskId && assignSlot(key)}
                  >
                    <span className="slot-label sub">{fmtHalf(h, 0)}</span>
                    {taskAtSlot(key) && (
                      <span className="slot-task-block">
                        {taskAtSlot(key)!.title}
                        <span className="slot-remove">✕</span>
                      </span>
                    )}
                  </div>
                  <div
                    className={`schedule-slot sub-slot${selectedTaskId ? " droppable" : ""}${blockHalf ? " occupied" : ""}`}
                    onClick={() => {
                      if (blockHalf) {
                        unscheduleTask(blockHalf.id);
                      } else if (selectedTaskId) {
                        assignSlot(keyHalf);
                      }
                    }}
                  >
                    <span className="slot-label sub">{fmtHalf(h, 1)}</span>
                    {blockHalf && (
                      <span className="slot-task-block">
                        {blockHalf.title.length > 30
                          ? blockHalf.title.slice(0, 29) + "…"
                          : blockHalf.title}
                        <span className="slot-remove">✕</span>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] Add CSS for schedule view to `app/globals.css` (append at end):

```css
/* ── Day Schedule View ────────────────────────────────────────────────────── */
.schedule-view {
  padding: 0 0 24px;
}

.schedule-tray {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 52px;
  align-items: center;
}

.schedule-tray-empty {
  font-size: 0.8rem;
  color: var(--muted);
  font-style: italic;
}

.schedule-chip {
  flex-shrink: 0;
  font-size: 0.78rem;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
}
.schedule-chip.selected {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.schedule-hint {
  font-size: 0.78rem;
  color: var(--accent);
  padding: 2px 16px 6px;
}

.schedule-timeline {
  padding: 0 16px;
}

.schedule-slot-group {
  margin-bottom: 2px;
}

.schedule-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface);
  cursor: pointer;
  min-height: 44px;
  transition: border-color 0.12s, background 0.12s;
}
.schedule-slot.droppable {
  border-color: var(--accent);
  background: #f0faf9;
}
.schedule-slot.occupied {
  background: var(--accent);
  border-color: var(--accent);
}

.schedule-slot.sub-slot {
  margin-top: 2px;
  background: var(--surface-muted);
  border-style: dashed;
}
.schedule-slot.sub-slot.droppable {
  background: #f0faf9;
  border-color: var(--accent);
  border-style: solid;
}
.schedule-slot.sub-slot.occupied {
  background: var(--accent);
  border-color: var(--accent);
  border-style: solid;
}

.slot-label {
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 600;
  width: 48px;
  flex-shrink: 0;
}
.schedule-slot.occupied .slot-label {
  color: rgba(255,255,255,0.75);
}
.slot-label.sub {
  font-weight: 400;
  width: 64px;
}

.slot-task-block {
  flex: 1;
  font-size: 0.82rem;
  color: #fff;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.slot-remove {
  font-size: 0.65rem;
  opacity: 0.7;
  flex-shrink: 0;
}

.slot-expand-hint {
  font-size: 0.7rem;
  color: var(--muted);
  margin-left: auto;
}
.schedule-slot.droppable .slot-expand-hint {
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 600;
}
```

- [ ] Run TypeScript check:

```bash
cd /Users/richshrestha/Documents/Projects/personal-ops && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] Commit:

```bash
git add components/schedule-view.tsx app/globals.css
git commit -m "feat: add ScheduleView timeline component"
```

---

### Task 5: Wire ScheduleView into `personal-ops-app.tsx`

**Files:**
- Modify: `components/personal-ops-app.tsx`

**Changes:**
1. Import `ScheduleView`
2. Add `scheduleViewActive` state (boolean), reset to `false` when `horizonFilter` changes away from "today"
3. Show List/Schedule toggle after the horizon buttons when `horizonFilter === "today"`
4. Render `<ScheduleView>` in place of the normal task sections when toggle is active

- [ ] Add import at top of `personal-ops-app.tsx` (after existing imports):

```tsx
import ScheduleView from "@/components/schedule-view";
```

- [ ] Add state near other `useState` declarations (around line 785):

```tsx
const [scheduleViewActive, setScheduleViewActive] = useState(false);
```

- [ ] When `horizonFilter` changes, reset schedule view. Find the `setHorizonFilter` call inside the horizon toggle buttons and change it to:

```tsx
onClick={() => {
  setHorizonFilter(h);
  if (h !== "today") setScheduleViewActive(false);
}}
```

- [ ] After the horizon toggle `</div>` (around line 1870), add the List/Schedule toggle that only appears for Today:

```tsx
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
```

- [ ] Add CSS for the mode toggle to `app/globals.css`:

```css
/* ── Schedule mode toggle (List | Schedule) ───────────────────────────────── */
.schedule-mode-toggle {
  display: flex;
  gap: 4px;
  padding: 4px 16px 8px;
}
.schedule-mode-btn {
  font-size: 0.78rem;
  padding: 5px 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.schedule-mode-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
```

- [ ] In the "Organized Backlog" and In Progress sections, wrap them with a check so they only render when `!scheduleViewActive`. Replace:

```tsx
{mobileTab === "active" && filteredInProgressTasks.length > 0 && (
```

with:

```tsx
{mobileTab === "active" && !scheduleViewActive && filteredInProgressTasks.length > 0 && (
```

And replace:

```tsx
{mobileTab === "active" && pendingBuckets.length > 0 && (
```

with:

```tsx
{mobileTab === "active" && !scheduleViewActive && pendingBuckets.length > 0 && (
```

Also hide the "Other" inbox section when schedule is active. Find similar patterns for inbox/other sections and add `!scheduleViewActive &&`.

- [ ] After the schedule-mode toggle, add the ScheduleView render (when active, instead of normal buckets):

```tsx
{mobileTab === "active" && scheduleViewActive && horizonFilter === "today" && (
  <ScheduleView
    tasks={filteredPendingTasks.concat(filteredInProgressTasks).filter((t) => t.horizon === "today")}
    onUpdate={(taskId, patch) => updateTask(taskId, patch)}
  />
)}
```

- [ ] Run TypeScript check:

```bash
cd /Users/richshrestha/Documents/Projects/personal-ops && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] Run build:

```bash
cd /Users/richshrestha/Documents/Projects/personal-ops && npm run build 2>&1 | tail -20
```

Expected: successful build.

- [ ] Commit:

```bash
git add components/personal-ops-app.tsx app/globals.css
git commit -m "feat: wire ScheduleView into Today filter on Active tab"
```

---

### Task 6: Push and deploy

- [ ] Push branch:

```bash
git push origin HEAD
```

- [ ] Deploy to production:

```bash
cd /Users/richshrestha/Documents/Projects/personal-ops && vercel --prod 2>&1 | tail -10
```

Expected: deployment URL printed.
