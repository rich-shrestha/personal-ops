# Personal Ops System

First-pass implementation of the approved design spec in [specs/personal-ops-design.md](specs/personal-ops-design.md).

## What Exists

- Next.js App Router scaffold
- Mobile-first capture and triage flow
- Organized task flow with capture inbox, overview cards, grouped backlog buckets, and mobile-first filters
- Work vs personal task scope with AI-assisted triage defaults and manual override
- Phone-friendly bottom tab bar for `Capture`, `Open`, `Done`, `Archived`, and `Ideas`
- Archive, restore, and delete actions for tasks plus delete actions for captures and ideas
- Server-backed triage, transcription, and agent-job routes with graceful fallback
- Anthropic-backed text triage and agent jobs
- OpenAI-backed transcription route with browser-speech fallback in the client
- Local-first persistence that prefers Supabase when the schema is available and otherwise keeps browser state intact
- Backward-compatible Supabase sync fallback that stores newer task metadata in `workflow_runs` when the remote schema lags behind the local code
- Ideas feed and SplitCheck shortcut
- PWA manifest, service worker registration, and install icons

## Current Tradeoffs

- Text AI is provider-configurable and falls back gracefully if no key is set
- Supabase schema and state sync are wired, but this repo is not currently linked in the Supabase CLI on this machine, so `supabase db push` has not been run here yet
- The remote Supabase database still appears to be missing the newer `task_cards.area` column, so the code now uses a compatibility fallback instead of hard-failing sync
- The current "agent" layer is real text reasoning, but not real external execution yet
- Google auth can gate the app to one allowed email, but credentials vault, notifications, and audit log are still not built

## Current Handoff Files

- `WORKLOG.md` for the latest implementation state and immediate next steps
- `PROJECT_BRIEF.md` for a fast repo-level overview intended for AI handoff

## Run

```bash
nvm use
npm install
npm run dev
```

Then open `http://localhost:3000`.

Use Node 22 for the cleanest install. The current machine's Node 23 build produced flaky npm extraction warnings during setup even though the app build completed.

## Env

Copy `.env.example` to `.env.local` when you are ready to turn on server integrations.

```bash
cp .env.example .env.local
```

Available vars:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `AI_TEXT_PROVIDER`
- `AI_TRANSCRIPTION_PROVIDER`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PERSONAL_OPS_ALLOWED_EMAIL`

## Provider Strategy

- Keep the current UX.
- Use Anthropic for text reasoning if you already have an Anthropic key.
- Use OpenAI for Whisper transcription.
- Use Supabase for cross-device persistence and workflow history.

## Auth

- Use Supabase Auth with the Google provider enabled.
- Set `PERSONAL_OPS_ALLOWED_EMAIL` to your exact Google email.
- The app now requires a valid Supabase session and rejects any signed-in user whose email does not match the allowed address.
- This is a single-user privacy gate. If you later want true multi-user separation, add `user_id` ownership columns plus row-level security in Supabase.

## Supabase Prep

The initial SQL migration is in:

`supabase/migrations/20260407210000_initial_personal_ops.sql`

Once you create and link a new Supabase project, the next steps are:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Current known project ref from `NEXT_PUBLIC_SUPABASE_URL`:

`bbceccswrlwnavrpraos`

## Workflow Spec

Concrete workflow levels and targets for this week are in:

`specs/2026-04-07-automation-matrix.md`

FreeTaxUSA research and browser-worker notes are in:

- `specs/2026-04-11-freetaxusa-notes.md`
- `specs/2026-04-11-browser-worker-plan.md`

## Browser Worker

A separate Playwright worker scaffold now lives in:

`browser-worker/`

This is the intended long-term execution layer for high-trust website tasks. It should run outside Vercel on a cheap worker/container and poll Supabase for explicit execution requests.

## Next Build Steps

1. Run `supabase login`, `supabase link --project-ref bbceccswrlwnavrpraos`, and `supabase db push`, or paste the migration into the Supabase SQL editor.
2. Verify the app shows `Synced` again after the remote schema catches up and remove the compatibility fallback later if it is no longer needed.
3. Add the same Anthropic, OpenAI, and Supabase values to the Vercel project env vars.
4. Deploy the current code so production uses the newer organization, filter, archive, and delete behavior.
5. Add the first real external action surfaces after confirmation: email, calendar, reminders, or browser automation for high-trust flows.
6. Add auth, audit logging, and tighter permissions before any autonomous high-trust execution.
