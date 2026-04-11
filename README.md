# Personal Ops System

First-pass implementation of the approved design spec in [specs/personal-ops-design.md](/Users/richshrestha/docs/superpowers/specs/personal-ops-design.md).

## What Exists

- Next.js App Router scaffold
- Mobile-first capture and triage flow
- Simple `To Do / In Progress / Done` task flow with confirm-to-start behavior
- Server-backed triage, transcription, and agent-job routes with graceful fallback
- Anthropic-backed text triage and agent jobs
- OpenAI-backed transcription route with browser-speech fallback in the client
- Local-first persistence that prefers Supabase when the schema is available and otherwise keeps browser state intact
- Ideas feed and SplitCheck shortcut
- PWA manifest, service worker registration, and install icons

## Current Tradeoffs

- Text AI is provider-configurable and falls back gracefully if no key is set
- Supabase schema and state sync are wired, but the remote schema still needs to be pushed to your new project
- The current "agent" layer is real text reasoning, but not real external execution yet
- No auth, credentials vault, notifications, or audit log yet

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

## Provider Strategy

- Keep the current UX.
- Use Anthropic for text reasoning if you already have an Anthropic key.
- Use OpenAI for Whisper transcription.
- Use Supabase for cross-device persistence and workflow history.

## Supabase Prep

The initial SQL migration is in:

`supabase/migrations/20260407210000_initial_personal_ops.sql`

Once you create and link a new Supabase project, the next steps are:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

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

1. Run `supabase login`, `supabase link --project-ref <your-project-ref>`, and `supabase db push`, or paste the migration into the Supabase SQL editor.
2. Add the same Anthropic, OpenAI, and Supabase values to the Vercel project env vars.
3. Deploy the current code so production uses the new backend routes.
4. Add the first real external action surfaces after confirmation: email, calendar, reminders, or browser automation for high-trust flows.
5. Add auth, audit logging, and tighter permissions before any autonomous high-trust execution.
