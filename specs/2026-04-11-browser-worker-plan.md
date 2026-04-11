# Browser Worker Plan

## Goal

Run high-trust browser workflows outside Vercel while keeping the main app as the control plane.

## Architecture

- `Next.js app on Vercel`
  Handles UI, task state, AI reasoning, and explicit execution requests.
- `Supabase`
  Stores workflow runs and browser handoff payloads.
- `Browser worker`
  Polls Supabase for `browserHandoffStatus = requested`, runs Playwright, and writes progress back.

## Why this is the cheapest reasonable approach

- no always-on browser in the web app
- one cheap worker can handle explicit sessions only
- deterministic step runners are cheaper than open-ended LLM browser driving
- sensitive actions stay behind explicit confirmation

## Effort Estimate

- Worker scaffold and queue contract: low, already done in this pass
- First real FreeTaxUSA login + navigation flow: medium
- Form-entry and review screens with pause points: medium-high
- Final guarded submit flow: high, because it needs stronger audit and confirmation controls

## First real worker steps

1. Add a dedicated credential / session bootstrap path
2. Implement login / resume-return navigation
3. Read the workflow payload and pause on each major screen
4. Persist screenshots / notes / current URL back into workflow payload
5. Require explicit final approval before any actual submission
