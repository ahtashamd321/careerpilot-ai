# CareerPilot AI – My Personal Career Agent

A personal career agent for an entry-level data analyst job search in India. Every morning it researches analytics news and hiring, pulls fresh jobs from legitimate sources, scores each one against your profile, looks up public hiring contacts, drafts three LinkedIn posts, and builds a daily report. Strong matches pop up in the app (and optionally on Telegram) the moment they're found.

Built with Next.js 15, React 19, TypeScript, Tailwind, Supabase (Postgres, Auth, Realtime, RLS), Gemini free tier or local Ollama, and GitHub Actions as the free background scheduler. Everything runs on free tiers.

## What's in the box

| Area | What it does | Where |
|---|---|---|
| Dashboard | Live stats, best matches, LinkedIn status, today's automation with a "run now" button, application pipeline, daily digest | `/dashboard` |
| Jobs | Fetch, dedupe, expire, score (35/25/10/15/10/5 weights), filter, hide, import any posting by pasting it | `/jobs`, `src/lib/jobs/*`, `src/lib/matching.ts` |
| Match review | Score ring, per-factor breakdown, strengths, gaps, eligibility, apply/skip advice | `/jobs/[id]` |
| Application assistant | Tailored resume suggestions, cover letter, interview prep per job. Never submits anything | `/jobs/[id]`, `src/lib/materials.ts` |
| Tracker | Saved, To apply, Applied, Assessment, Interview, Offer, Rejected with dates, recruiter, notes | `/applications` |
| LinkedIn posts | 3 drafts a day; edit, rewrite with instructions, approve, publish now, schedule, copy, open in composer | `/posts`, `src/lib/posts.ts` |
| LinkedIn connection | Official OAuth 2.0 / OpenID Connect, encrypted token, publishing via the official Posts API | `/settings`, `src/lib/linkedin.ts` |
| Research | Google News RSS + official blogs, AI summaries, daily digest, sources and dates stored | `/research`, `src/lib/research.ts` |
| Recruiters | Public hiring contacts via grounded web search, each with a source link, marked unverified until you check | `/recruiters`, `src/lib/recruiters.ts` |
| Notifications | Real-time pop-ups for matches over your threshold with View job / Review match / Remind me later; bell; desktop and Telegram alerts | `src/components/notifications.tsx` |
| Reports | Daily summary with PDF and CSV export | `/reports`, `src/lib/reports.ts` |
| Memory | Search across everything, interview and learning notes, JSON export, delete | `/memory` |
| Activity log | Every run, attempt, result and error | `/activity` |

## Honest limits, and what the app does instead

These are platform restrictions, not missing features. The app is built around them rather than pretending they don't exist.

| Wanted | Reality | What CareerPilot does |
|---|---|---|
| LinkedIn job search | LinkedIn offers individuals no job-search API, and scraping breaks its terms | Jobs come from Greenhouse, Lever, Ashby, Remotive, Adzuna and Jooble. For a LinkedIn or Wellfound posting, paste it into **Add a job** and it's scored like the rest |
| Recruiter lookup on LinkedIn | No people-search API for individuals | Gemini's Google Search grounding finds people who have *publicly* posted about hiring. Each entry keeps its source URL and is marked unverified. Emails and phone numbers are stripped and never stored |
| Wellfound jobs | No public API | Paste-to-import |
| LinkedIn tokens | Self-serve apps get ~60-day tokens with no refresh | Expiry date shown; reconnect in one click. Posts still work via copy or the composer link meanwhile |
| Job salary | Most Indian postings don't list it | Shown when the source provides it; Adzuna's *predicted* salaries are ignored |
| Exact 8:00 AM | GitHub's scheduler can run late at busy times | Runs within roughly an hour of your chosen IST hour |

Experience honesty is enforced in code, not just in prompts: your CRM role is stored as `non_analytics`, scoring counts only analytics years as analyst experience, and every AI prompt carries the same rule (`HONESTY_RULES` in `src/lib/ai.ts`). Jobs whose experience bar is out of reach are capped at 49 so they can't outrank realistic ones.

## Setup (about 30 minutes)

You need Node 20+, a GitHub account, and free accounts at Supabase, Vercel and Google AI Studio.

### 1. Supabase

1. Create a project at supabase.com (free tier).
2. Open **SQL Editor**, paste `supabase/migrations/0001_init.sql`, run it. It's safe to re-run.
3. **Authentication → URL Configuration**: set Site URL to your app URL and add `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback` as redirect URLs.
4. **Project Settings → API**: copy the project URL, the `anon` key and the `service_role` key.

### 2. Gemini (free)

Create a key at aistudio.google.com. Default model is `gemini-2.5-flash`; change `GEMINI_MODEL` if Google renames free-tier models. The app makes roughly 10–20 calls a day.

Privacy note: on Google's free tier, prompts may be used to improve Google's products. Prompts contain your profile and job text, never tokens or passwords. If that matters to you, use Ollama locally or a paid Gemini tier.

**Ollama instead:** set `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. Ollama must be reachable from where the code runs, so it works for local development and for a self-hosted runner, but not from Vercel or GitHub's hosted runners unless you expose it securely. Grounded recruiter search is Gemini-only.

### 3. LinkedIn developer app (free)

1. Go to linkedin.com/developers and create an app. LinkedIn requires you to link a LinkedIn Page; creating a simple page for yourself works.
2. Under **Products**, add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. Under **Auth**, add redirect URLs `http://localhost:3000/api/linkedin/callback` and `https://YOUR-APP.vercel.app/api/linkedin/callback`.
4. Copy the Client ID and Client Secret.
5. Generate the token encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

`LINKEDIN_API_VERSION` is a `YYYYMM` value. LinkedIn retires versions after about a year; if publishing starts failing with a version error, set it to a recent month. The code already falls back to the legacy UGC endpoint.

### 4. Optional free job APIs

- **Adzuna** (good India coverage): developer.adzuna.com → `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
- **Jooble**: request a key at jooble.org/api/about → `JOOBLE_API_KEY`
- **Company boards**: no key needed. In Settings → Company job boards, type a company's board name (from URLs like `jobs.lever.co/NAME`); it's checked live before being added.

### 5. Optional Telegram alerts

Create a bot with @BotFather → `TELEGRAM_BOT_TOKEN`. Message your bot once, then put your chat ID in Settings and press **Send test**.

### 6. Run locally

```bash
cp .env.example .env.local   # fill in values
npm install
npm test                     # matching, sources, dedupe, RSS, LinkedIn formatting, crypto, PDF/CSV
npm run dev
```

Open http://localhost:3000, create an account, and your profile is seeded from the brief (editable under Profile). Press **Run today's automation now** on the Dashboard.

### 7. Deploy to Vercel (free)

1. Push this folder to a GitHub repository.
2. Import it in Vercel. Add every variable from `.env.example` in Project → Settings → Environment Variables, with `NEXT_PUBLIC_APP_URL` set to your Vercel URL.
3. Deploy, then update the Supabase and LinkedIn redirect URLs to the real domain.

### 8. Turn on the background scheduler

In the GitHub repo → Settings → Secrets and variables → Actions, add these secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TOKEN_ENCRYPTION_KEY`, `LINKEDIN_API_VERSION`, and any optional ones you use (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY`, `TELEGRAM_BOT_TOKEN`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`).

`.github/workflows/automation.yml` runs every hour. Each run publishes scheduled posts that are due, then runs the daily pipeline for anyone whose IST hour has arrived and who hasn't had a successful run today. Use **Actions → CareerPilot automation → Run workflow** (tick *force*) to test it immediately.

## How the automation stays safe

- **No duplicate runs:** each (user, day, step) is claimed in `automation_runs` before work starts. A second trigger the same day is skipped; a run stuck as "running" for 10+ minutes is treated as crashed.
- **Retries:** each step retries 3 times with exponential backoff. If it still fails, the next hourly run tries again, at most twice a day, then waits for a manual run so you don't get an alert every hour.
- **Isolation:** steps are independent, so a research outage doesn't stop job matching. A failing job board is logged and the others continue.
- **No double-posting:** scheduled posts are claimed (`scheduled → publishing`) before publishing.
- **Errors are never silent:** each failure is written to the activity log and sent as a notification, and the GitHub run turns red.
- **Duplicate jobs:** keyed on company + title + city, so the same role on two boards shows once. Dismissed jobs stay dismissed. ATS jobs missing from a successfully loaded board are marked expired; aggregator jobs expire after your max age.

## Security

- LinkedIn access tokens are encrypted with AES-256-GCM (`src/lib/crypto.ts`) and live in a table with RLS enabled and **no** policies, so no browser session can read them, including your own.
- All other tables use RLS so each account only sees its own rows (verified against Postgres 16: cross-user reads return nothing and cross-user writes are rejected).
- The service-role key is only used server-side (`src/lib/supabase/admin.ts` refuses to run in a browser) and in GitHub Actions secrets.
- The OAuth flow uses a random `state` bound to your session to block CSRF.
- Your LinkedIn password is never requested or stored. Applications are never submitted automatically, and posts are never published without your approval.

## Free-tier notes

- **Supabase:** free projects pause after a week without activity. The hourly scheduler queries the database, which keeps it active. 500 MB is plenty for years of this data.
- **GitHub Actions:** unlimited minutes on public repos (secrets stay secret). On a private repo the hourly schedule uses roughly 1,000–1,500 of the 2,000 free minutes a month; if that's tight, change the cron to every 2 or 3 hours. GitHub disables schedules in repos with no activity for 60 days; any push re-enables them.
- **Vercel Hobby:** for personal, non-commercial use. "Run now" calls one step per request to stay within function time limits; the daily run happens in GitHub Actions, which has no such limit.
- **Gemini free tier:** rate limits vary by model and change over time. If you hit them, the step retries and logs the error; job fetching and scoring don't need AI at all.

## Project layout

```
src/app/(app)/*        pages (dashboard, jobs, applications, posts, research, recruiters, reports, memory, activity, profile, settings)
src/app/api/*          LinkedIn OAuth + publish, manual automation step, report export, memory export
src/app/actions.ts     server actions for every user operation
src/lib/matching.ts    weighted scoring, experience parsing, skill extraction
src/lib/jobs/*         job sources and the fetch → dedupe → expire → score → notify pipeline
src/lib/automation.ts  step runner with claiming, retries and logging
scripts/               scheduler entry point and tests
supabase/migrations/   schema, RLS, realtime
```
