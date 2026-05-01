# Project Brief

## Project

`Documents/Projects/personal-ops`

Personal ops assistant app for rapid capture, AI triage, task organization, and future supervised execution.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Anthropic SDK
- OpenAI SDK
- Supabase
- PWA shell

## Primary User Goal

Make personal administration and lightweight chief-of-staff workflows feel usable on phone and desktop:

- capture quickly
- organize clearly
- separate work vs personal
- move tasks through open, done, and archived states
- hand structured tasks off to AI

## Current UX Model

- Always-visible capture bar
- AI triage confirmation card
- Sticky filter bar for area and completion status
- Mobile bottom tabs for major app sections
- Organized backlog instead of a single flat to-do list
- Task cards with archive, restore, delete, and start/done actions

## Key Data Concepts

- `Capture`
  - raw input from text or voice
- `TaskCard`
  - includes `area`, `category`, `complexity`, `status`, and optional `archivedAt`
- `AgentJob`
  - AI work result or follow-up question
- `WorkflowRun`
  - structured automation flows, especially tax prep

## Important Current Constraint

The remote Supabase schema is behind the local code.

Known issue:

- remote `task_cards` appears to be missing `area`

Mitigation already added:

- sync compatibility fallback in `lib/server/state-store.ts`
- newer task metadata is mirrored into a synthetic `workflow_runs` entry so sync can continue instead of falling back to memory mode

## Immediate Follow-Up

1. Authenticate Supabase CLI on this machine
2. Link the repo to project ref `bbceccswrlwnavrpraos`
3. Push migrations
4. Verify `Synced` storage mode in the UI
5. Deploy

## Files To Trust First

- `README.md`
- `WORKLOG.md`
- `components/personal-ops-app.tsx`
- `lib/server/state-store.ts`
- `lib/server/personal-ops-ai.ts`
- `lib/types.ts`
- `supabase/migrations/20260407210000_initial_personal_ops.sql`
