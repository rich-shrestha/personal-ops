# Worklog

## Current Status

- Repo: `Documents/Projects/personal-ops`
- App: Next.js personal ops PWA with AI triage, task organization, and workflow scaffolding
- Local code is ahead of the remote Supabase schema
- Current code passes `npm run lint`, `npm run typecheck`, and `npm run build`

## What Changed Recently

- Reworked the task UI from a flatter list into an organization-oriented dashboard:
  - overview cards
  - capture inbox
  - grouped backlog buckets
  - clearer in-progress and done handling
- Added `work` vs `personal` task scope
- Added sticky filters for:
  - `Open`
  - `Done`
  - `All`
  - `All`
  - `Personal`
  - `Work`
- Added mobile bottom navigation tabs:
  - `Capture`
  - `Open`
  - `Done`
  - `Archived`
  - `Ideas`
- Added task actions:
  - archive
  - restore
  - delete
- Added delete actions for raw captures and ideas
- Tightened AI prompts so triage returns:
  - shorter action-first titles
  - better context
  - `work` vs `personal` classification
  - more structured agent output

## Supabase State

- `.env.local` contains:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Known project ref from the env URL: `bbceccswrlwnavrpraos`
- Live Supabase check returned:
  - `column task_cards.area does not exist`
- `supabase db push` could not be run from this repo because:
  - the repo is not linked
  - the CLI is not authenticated on this machine

## Compatibility Fallback Added

- `lib/server/state-store.ts` now falls back when the remote schema is older
- Newer task metadata such as:
  - `area`
  - `archivedAt`
  is mirrored into a synthetic `workflow_runs` record with `workflow_key = "app-state"`
- This avoids hard-failing sync while the remote schema catches up
- Server sync now also deletes stale rows instead of only upserting them

## Remaining High-Value Next Steps

1. Run `supabase login`
2. Run `supabase link --project-ref bbceccswrlwnavrpraos`
3. Run `supabase db push`
4. Confirm the app shows `Synced` instead of falling back to `Local`
5. Deploy the updated app
6. Consider separating the capture-bar label into:
   - `Storage: Synced`
   - `AI: Anthropic`
   to remove ambiguity
7. Later, remove the compatibility fallback once the DB schema is fully current

## Files Touched In This Pass

- `app/globals.css`
- `components/personal-ops-app.tsx`
- `lib/mock-data.ts`
- `lib/personal-ops.ts`
- `lib/server/personal-ops-ai.ts`
- `lib/server/state-store.ts`
- `lib/types.ts`
- `supabase/migrations/20260407210000_initial_personal_ops.sql`
