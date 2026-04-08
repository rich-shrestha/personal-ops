# Personal Ops — Deploy Plan

**Goal:** Ship the personal ops app as a live, shareable URL. No auth required for now (single-user, personal use).

**Stack:** Next.js 14 (App Router) · localStorage state · PWA-ready  
**Target host:** Vercel (already used for splitcheck)

---

## What exists

- `/docs/superpowers/` — Next.js project, dev server runs at localhost:3000
- All state is localStorage — no backend needed for Phase 1
- No environment variables required for Phase 1

---

## Step 1 — Confirm the project builds cleanly

```bash
cd /Users/richshrestha/docs/superpowers
npm run build
```

Fix any build errors before continuing. TypeScript check should already pass.

---

## Step 2 — Create a GitHub repo for this project

The project currently lives at `/docs/superpowers/` inside what might be a larger repo. Codex should:

1. Check if `/docs/superpowers/` is already a git repo:
   ```bash
   cd /Users/richshrestha/docs/superpowers && git status
   ```

2. If not, initialize one:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — personal ops app"
   ```

3. Create a new GitHub repo (suggest name: `personal-ops`) and push:
   ```bash
   gh repo create personal-ops --public --source=. --remote=origin --push
   ```
   Use `--private` if preferred.

---

## Step 3 — Add a Vercel project

Option A — Vercel CLI (if authenticated):
```bash
vercel --prod
```
Follow prompts: link to GitHub repo, accept defaults for Next.js.

Option B — Vercel dashboard:
1. Go to vercel.com → Add New Project
2. Import the `personal-ops` GitHub repo
3. Framework: Next.js (auto-detected)
4. No environment variables needed
5. Deploy

---

## Step 4 — PWA manifest (optional but nice for mobile)

The project has `pwa-provider.tsx`. Verify `public/manifest.json` exists with:
```json
{
  "name": "Personal Ops",
  "short_name": "Ops",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f7f6f4",
  "theme_color": "#0d6c63",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

If icons don't exist, create simple placeholder PNGs or skip for now — the app will still work.

---

## Step 5 — Custom domain (optional)

If you want a clean URL (e.g. `ops.richshrestha.com`):
1. In Vercel project settings → Domains → Add domain
2. Add a CNAME record pointing to `cname.vercel-dns.com` in your DNS provider

Otherwise the default `personal-ops-xxx.vercel.app` URL is shareable immediately.

---

## What Codex needs to execute this

1. A terminal with git, gh CLI, and vercel CLI (or dashboard access)
2. The project at `/Users/richshrestha/docs/superpowers/`
3. GitHub and Vercel accounts already authenticated

Codex can handle Steps 1–4 autonomously if CLI tools are available. Step 5 requires DNS access.

---

## Phase 2 additions (after live)

Once deployed, the next things to wire up:
- Supabase for persistent cross-device state (replace localStorage)
- Anthropic API for real agent triage + task execution
- Push notifications for queued task alerts (PWA push API)

These require environment variables in Vercel:
```
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```
