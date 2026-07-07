# Deploying apps/web to Vercel

The repo is a pnpm monorepo; Vercel handles it natively. One-time setup
(~3 minutes in the dashboard):

1. Go to <https://vercel.com/new> and **Import** the `1pacent/1pacent-app`
   GitHub repository (install the Vercel GitHub app on the org if asked).
2. In the import screen set:
   - **Root Directory:** `apps/web`  ← the only setting that matters
   - Framework preset: Next.js (auto-detected)
   - Build/install commands: leave default (Vercel detects
     `pnpm-workspace.yaml` and installs from the repo root)
3. **Environment variables:** none are required for demo mode. Add these
   later to flip the app onto live Supabase data (Settings → Environment
   Variables; mark the service key as *Sensitive*):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://yxgvvbfsbvykmsqzuzxi.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase dashboard → Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (same page — server-only secret)
   - `DATA_SOURCE=demo` to force demo data even with keys present
4. Deploy. Production tracks `main`; every branch push gets a preview
   URL — the current work lives on `claude/github-app-install-evgk45`,
   so open that branch's preview deployment to test, or merge to `main`.

## What to test on the deployment

- `/dashboard` — traffic-light portfolio (Fitzroy red: overdue gas check)
- `/properties/prop-fitzroy` — compliance table + request event timelines
- `/r/demo-intake` — lodge a request; pick an urgent category ("No hot
  water") to see the VIC urgent fast-track vs. a routine one
- `/a/demo-approval` — one-tap landlord approve/decline

Demo-mode note: the in-memory store resets whenever the serverless
function recycles — lodged requests may disappear after a few minutes.
That's expected until Supabase env vars are set.

## CLI alternative (if you prefer not to use the dashboard)

```bash
npm i -g vercel
cd apps/web
vercel link          # authenticates in the browser, creates the project
vercel               # preview deploy
vercel --prod        # production deploy
```

To let Claude Code deploy for you in future sessions, add a `VERCEL_TOKEN`
(vercel.com → Account Settings → Tokens, scoped to this project's team)
as an environment variable in this Claude environment's settings — not in
chat, not in the repo.
