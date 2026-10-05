# HireKit

A personal job-search command centre: CVs, applications, interview practice and
a calendar in one place, with AI where it actually saves time.

Built with Next.js 14 (App Router), Supabase and Groq.

---

## What it does

**CV builder** — upload your existing CVs as PDFs, they're parsed with AI, then
generate a single ATS-oriented CV targeted at a specific job description. The
model reads all your uploads at once and combines the relevant parts.

**Applications** — a kanban board from draft through to offer, with the stale
ones surfaced for follow-up.

**Job search** — pools several remote job boards and classifies every result by
**who is actually allowed to apply**. Most remote listings name regions that
exclude large parts of the world; results are filtered to the ones you're
eligible for, with the board's own wording shown so you can check.

**Calendar** — interviews, deadlines and follow-ups, with two-way Google
Calendar sync, recurring events and reminders that reach your phone.

**Interview prep** — generated MCQs, written prompts with AI scoring, and
LeetCode-style problems for any role. Answers are scored and kept, so you get
streaks, month-over-month trends, and which topics you've improved at or
dropped.

**Skills audit** — rate yourself across ~190 microskills in three tracks (web,
AI engineering, embedded/PCB) and see readiness against specific roles.

**Cover letters** — generated per application, kept alongside it.

---

## Stack

| | |
|---|---|
| Framework | Next.js 14, App Router, TypeScript |
| Database / auth | Supabase (Postgres, RLS, email + Google OAuth) |
| AI | Groq (`openai/gpt-oss-20b` and `-120b`) |
| Integrations | Google Calendar, SMTP email, WhatsApp |
| PDF | `pdf-parse` in, jsPDF + html2canvas out |

---

## Running it

```bash
npm install
cp .env.local.example .env.local   # fill in your keys
npm run dev
```

Then run the SQL in `supabase/migrations/` in order, via the Supabase dashboard
SQL editor.

You'll need a Supabase project, a Groq API key (free tier is enough), and —
only for calendar sync — a Google OAuth client with the callback URL
registered.

### Desktop build

There's also a native desktop shell: a small C/WebView2 wrapper that runs the
Next.js standalone server locally and shows it in a native window, with no
bundled browser.

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

Needs Node.js on `PATH` and MinGW for the C shell.

---

## Notes for anyone reading the code

**Some adapters are optional.** `src/lib/optional-linkedin.ts` loads an adapter
from `private/` at runtime if it exists. That directory isn't published, so the
job search runs on its public-API sources alone. Nothing breaks when it's
absent — that's the point of the design.

**Secrets never enter the repo.** `.env.local` is gitignored;
`.env.local.example` lists the variable names with placeholder values. Deploy
targets inject the real ones.

**Migrations are append-only.** Skill ids and other stored keys are stable
identifiers — add, never rename.

---

## Status

A personal project, built for one user and used daily. It's public because the
patterns may be useful to others, not because it's a product. No support
implied, and the schema may change without migration paths for existing
deployments.
