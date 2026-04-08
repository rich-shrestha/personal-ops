# Personal Ops System

First-pass implementation of the approved design spec in [specs/personal-ops-design.md](/Users/richshrestha/docs/superpowers/specs/personal-ops-design.md).

## What Exists

- Next.js App Router scaffold
- Mobile-first capture and triage flow
- Local task queue with confirm-to-start behavior
- Server-backed triage and agent-job routes with graceful fallback
- Ideas feed and SplitCheck shortcut
- PWA manifest, service worker registration, and install icons

## Current Tradeoffs

- Persistence is local storage, not Supabase yet
- Anthropic is optional and only activates when `ANTHROPIC_API_KEY` is set
- Supabase env scaffolding exists, but persistence is not wired yet
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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Next Build Steps

1. Replace local storage with Supabase tables for captures, task cards, and agent jobs.
2. Add real follow-up answer persistence and threaded job history.
3. Add push/badge notifications and auto-queue timing rules.
4. Add auth and scoped credential handling before any high-trust actions.
