# Browser Worker

Separate high-trust execution worker for Personal Ops.

## Why this exists

- Vercel is good for the app and API routes.
- It is not the right place for long-running browser sessions.
- Playwright should run in a dedicated worker process with explicit execution requests.

## What this worker does

- Polls Supabase for workflow runs that have `browserHandoffStatus = requested`
- Locks one run at a time
- Converts the stored handoff plan into a deterministic Playwright session
- Writes progress and results back into the workflow payload
- Never auto-submits sensitive flows without an explicit final approval gate

## Intended deployment

- cheap VPS
- Railway / Fly / Render worker
- Docker container
- any small always-on Node runtime

## Setup

```bash
cd browser-worker
cp .env.example .env
npm install
npx playwright install chromium
npm run dev
```

## Current status

This is a scaffold. The worker currently:

- polls Supabase
- finds requested FreeTaxUSA browser handoffs
- marks progress in the workflow payload
- stubs the Playwright execution function

It does not yet log into FreeTaxUSA or enter tax data automatically.
