# Think Tab + Nav Redesign

**Date:** 2026-04-25  
**Status:** Approved

## Overview

Two changes shipped together:
1. **Nav restructure** — simplify the tab/filter duplication into a clean 4-tab layout with a Personal/Work toggle
2. **Think tab** — a new first-class feature: brain dump, journal, and sparring partner that extracts tasks and ranks them by time-to-complete

---

## Nav Restructure

### What changes

**Remove:**
- Filter bar (`completionFilter` chips: Open / Done / All)
- Area filter chips (Personal / Work / All) from the filter bar
- `MobileTab` type values: `"capture"` and `"archived"`

**Add:**
- Personal / Work toggle at the top of the page (persistent, filters all tabs)
- `"think"` tab replaces `"capture"`
- `"archived"` folds into the Done tab as a collapsible section at the bottom

**New `MobileTab` type:** `"active" | "think" | "done" | "ideas"`

### Tab responsibilities

| Tab | Content |
|---|---|
| Active | In-progress and queued tasks. Inline "Add a task" input at top for direct entry (no AI). |
| Think | Brain dump input + past think entries (journal). See Think tab section below. |
| Done | Completed tasks. Archived tasks in a collapsible "Archived" section below. |
| Ideas | Unchanged — prompt library cards. |

### Personal / Work toggle

- Rendered at the top of the page, above the tab content
- Persists in component state (default: `"all"` shows both)
- Filters tasks across Active, Done, and archived sections
- Does not filter Think entries or Ideas (those are area-agnostic)

### Active tab — inline task add

- A small input at the top of Active: `"+ Add a task..."`
- On submit: creates a task directly with status `"triaged"`, no AI triage
- Title is required; everything else defaults (area from toggle, category `"other"`, complexity `"quick"`)
- Does not go through the capture flow — bypasses AI entirely

---

## Think Tab

### Purpose

A single place for anything that's on your mind. Works in two modes depending on input:

- **Automator mode:** You list things to do → Claude extracts tasks, ranks by time-to-complete, you confirm which to add
- **Sparring mode:** You're thinking through something → Claude responds conversationally, may still surface tasks if they're implicit

Claude decides which mode applies based on the content. Both modes save the entry.

### UX flow

1. User types freely into a text area (no character limit)
2. Tap Submit
3. Claude responds with:
   - A conversational reply (always)
   - An extracted task list if actionable items were found — each item shows title + estimated time (`quick` / `research` / `multi-step`)
4. User reviews extracted tasks, unchecks any they don't want, taps "Add tasks"
5. Tasks are added to Active with status `"triaged"` and the think entry's area
6. Entry is saved to `think_entries` and appears below the input as a journal

### Think entry display

- Newest-first list below the input
- Each entry shows: date, first ~80 chars of text, Claude's response (collapsed by default, tap to expand)
- Extracted tasks that were confirmed show as linked chips on the entry

### AI prompt behavior

- Uses `RICH_CONTEXT` + the existing `personalOpsSystemContext`
- Returns JSON: `{ response: string, tasks: { title: string, context: string, complexity: "quick" | "research" | "multi-step" }[] }`
- If no tasks found, `tasks` is an empty array
- `response` is always present — at minimum a one-sentence acknowledgment

---

## Data Model

### New type: `ThinkEntry`

```ts
export interface ThinkEntry {
  id: string;
  text: string;
  claudeResponse: string;
  extractedTasks: { title: string; context: string; complexity: TaskComplexity }[];
  confirmedTaskIds: string[];   // IDs of tasks the user actually added
  area: TaskArea | "all";
  createdAt: string;
}
```

### `PersistedAppState` additions

```ts
thinkEntries: ThinkEntry[];
```

### New Supabase table: `think_entries`

```sql
create table if not exists public.think_entries (
  id text primary key,
  text text not null,
  claude_response text not null default '',
  extracted_tasks jsonb not null default '[]'::jsonb,
  confirmed_task_ids jsonb not null default '[]'::jsonb,
  area text not null default 'all',
  created_at timestamptz not null default now()
);
```

### New API route: `POST /api/think`

- Accepts: `{ text: string; area: string }`
- Calls Claude with the think prompt
- Returns: `{ entry: ThinkEntry }`
- The entry is saved client-side into `thinkEntries` state, then persisted via the existing `POST /api/state` sync

---

## What's Not Changing

- Task cards, `AgentJob`, workflows — untouched
- Supabase sync pattern (`syncTable` in `state-store.ts`) — same approach, `think_entries` table added to sync
- Ideas tab — unchanged
- Triage and agent job flows — unchanged
- `RICH_CONTEXT` block in `personal-ops-ai.ts` — unchanged

---

## Files to Touch

| File | Change |
|---|---|
| `lib/types.ts` | Add `ThinkEntry` type, add `thinkEntries` to `PersistedAppState` |
| `lib/server/personal-ops-ai.ts` | Add `thinkEntry()` function |
| `lib/server/state-store.ts` | Add `think_entries` to `loadAppState` and `saveAppState` |
| `app/api/think/route.ts` | New POST route |
| `components/personal-ops-app.tsx` | Nav restructure + Think tab UI |
| `app/globals.css` | Minor style additions for Think tab |
| `supabase/migrations/` | New migration for `think_entries` table |
