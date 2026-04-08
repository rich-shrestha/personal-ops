# Personal Ops System — Design Spec

**Project name:** personal-ops-system

**Date:** 2026-04-05  
**Status:** Approved  
**Stack:** Next.js + Supabase (PWA)

---

## Overview

A personal ops web app for quick note capture, task triage, and agent handoff. Works on phone and desktop. Agents pick up tasks and execute them autonomously, surfacing follow-up questions as needed. The user stays in a confirmation-only role — no manual execution of tasks they could delegate.

---

## Core Objects

### Capture
Raw, unstructured input. No required fields. One line or a voice dump. Just gets it in fast.

Fields: `id`, `raw_text`, `created_at`, `source` (text | voice | splitcheck)

### Task Card
A triaged item ready to act on. The unit agents work from.

Fields:
- `id`
- `title` — AI-generated from capture, user-confirmed
- `context` — notes, links, background
- `category` — finance | health | career | admin | other
- `complexity` — quick | research | multi-step
- `status` — inbox → triaged → queued → in-progress → waiting-on-you → done
- `due_date` (optional)
- `source_capture_id`
- `created_at`, `updated_at`

### Agent Job
A Task Card that has been handed off to an agent.

Fields:
- `id`
- `task_card_id`
- `agent` — Phase 1: `claude-api` (server-side call to Anthropic API, result streamed to UI)
- `status` — pending-confirmation | running | waiting-on-user | completed | failed
- `follow_up_questions` — array of questions the agent is surfacing back
- `output` — results, links, drafts
- `started_at`, `completed_at`

### Credential Entry *(Phase 2)*
A scoped secret tied to specific task categories. E.g., bank login for finance tasks.

Fields: `id`, `label`, `category`, `encrypted_secret`, `scope`

---

## Capture Flow

```
[Voice or Text Input]
        ↓
   Capture saved (raw)
        ↓
   AI triage runs automatically:
   - suggests title, category, complexity
   - flags if it looks like a SplitCheck request
        ↓
   User confirms or edits (one tap on mobile)
        ↓
   Task Card created → status: triaged
        ↓
   System auto-queues eligible tasks (status: queued)
   Eligible = complexity: quick, OR triaged for 24h+ without user action
   User gets badge/notification
        ↓
   User confirms start → status: in-progress
        ↓
   Agent Job created and runs
        ↓
   Follow-up questions surface in UI → user answers
        ↓
   Agent continues → status: done
```

---

## Voice Capture

- **Phase 1:** Browser Web Speech API (free, on-device)
- **Phase 2:** OpenAI Whisper API ($0.006/min) if accuracy is insufficient
- UI: large hold-to-record button, thumb-accessible on mobile
- Transcription drops into Capture as raw text
- Same triage flow as text capture

---

## Agent Handoff

- Task Cards with status `queued` are visible to agents
- System notifies user when tasks are auto-queued (badge + optional push)
- **User must confirm before any agent job starts** — one tap
- Agent job runs and sends follow-up questions back to the UI
- User answers in-app; agent continues execution
- Agent jobs are scoped to what credentials exist (Phase 1: research/drafting only; Phase 2: account access)

---

## SplitCheck Integration

- Dedicated capture shortcut: "Request money from someone"
- Creates a Task Card pre-tagged `category: splitcheck`
- Agent drafts the request message
- User reviews and approves
- Phase 1: user sends the drafted message manually in SplitCheck
- Phase 2: direct API integration with SplitCheck to fire the request automatically

---

## Ideas Feed

Surfaces when task queue is low or on a daily schedule:

- Subscription review reminders (if not done in 30+ days)
- SplitCheck follow-ups (people who haven't paid)
- Research suggestions based on existing tasks ("you mentioned refinancing 2 weeks ago — want current rates?")
- Personal automation ideas ("you have 4 finance tasks — want a budget review template?")

Each idea is one tap to convert into a Task Card.

---

## Surfaces

### Mobile (PWA, installable from browser)
- Big capture button (text or voice) — center of home screen
- Quick triage confirmation — single screen
- Task queue — swipeable cards
- Agent jobs + follow-up Q&A
- Ideas feed at bottom

### Desktop
- Two-column layout: capture + triage left, task queue + agent jobs right
- Ideas feed as a sidebar panel or bottom section

---

## High-Trust Actions (Phase 2)

- Credential vault — encrypted, scoped to task category
- Agent can log in to accounts on user's behalf for specific scoped tasks
- Every high-trust action requires explicit user confirmation before execution
- Audit log of all agent actions taken
- North star: fully autonomous end-to-end execution with user in confirmation-only role

---

## What Stays Markdown

Until the app is live:
- `PERSONAL_OPS.md` remains the active dashboard
- `CURRENT_CONTEXT.md` remains the session reload point
- Markdown is deprecated for task tracking once the web app is capturing real data

After the app is live:
- Markdown context files stay for AI session reloading (they serve a different purpose)
- Task management fully moves to the web app

---

## Phased Build Plan

**Phase 1 — MVP (Days 1–4)**
- Capture (text + voice) → AI triage → Task Card
- Task queue with status tracking
- Basic agent handoff (confirm to start, follow-up Q&A loop)
- PWA setup (installable on iPhone)

**Phase 2 — Intelligence (Days 5–7)**
- Ideas feed
- SplitCheck shortcut
- Auto-queue with notification/badge

**Phase 3 — High Trust (Week 2+)**
- Credential vault
- Scoped agent logins
- Audit log

---

## Out of Scope (for now)

- Native iOS/Android app (PWA covers it)
- Multi-user support
- Public-facing features
- Complex agent orchestration platform (keep handoff simple first)
