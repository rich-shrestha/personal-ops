# Personal Ops — Automation Matrix

## Execution Levels

- `think`: classify, research, summarize, compare, recommend
- `prepare`: gather requirements, build packets, create scripts/checklists, structure next steps
- `confirm-act`: send, submit, schedule, or write externally after user approval
- `high-trust`: log into sensitive systems and complete protected flows with audit logging

## Workflow Targets This Week

### Taxes on FreeTaxUSA

- Goal: finish filing this week
- Default level now: `prepare`
- Path to value:
  - identify missing forms and data
  - create tax-prep checklist
  - create guided filing session plan
  - capture blockers and unresolved questions
- Later `high-trust` path:
  - log in to FreeTaxUSA
  - enter data section by section
  - stop before final submit unless explicitly confirmed

### Refinance Car

- Goal: compare refinance options and decide whether to apply
- Default level now: `think` + `prepare`
- Path to value:
  - research lenders and likely rates
  - compare term, APR, monthly payment, payoff timing
  - produce shortlist and recommended order
  - prepare applications/checklist
- Later `confirm-act` path:
  - submit outreach or soft-quote forms after approval

### Dentist Quotes

- Goal: gather comparable quotes this week
- Default level now: `prepare`
- Path to value:
  - define services to quote
  - create provider list
  - create call/email script
  - create comparison table
- Later `confirm-act` path:
  - submit contact forms or send outreach after approval

## Product Mapping

### Current UI

- Capture bar: raw intake
- Action zone: triage or follow-up
- To Do / In Progress / Done: execution state

### Required Backend Pieces

- Speech transcription provider
- Text reasoning provider
- Persistent task/job storage
- Workflow templates by task type
- Audit trail for high-trust runs

## Initial Workflow Templates

- `tax-filing-session`
- `auto-refinance-comparison`
- `dentist-quote-collector`
- `weekly-reset`
- `splitcheck-follow-up`

## What Stays Out of Scope For The Next Pass

- autonomous bank logins
- automatic tax submission
- credential vault execution
- unattended browser sessions against sensitive sites
