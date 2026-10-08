// Employers worth watching directly from Nigeria: Nigerian tech companies,
// remote-first ones whose roles are open to Nigeria, and the energy and
// engineering employers behind most graduate-trainee programmes. Each
// publishes openings through an applicant-tracking system with a public JSON
// feed, so they are read straight from the source rather than via a board.
//
// Every slug here was checked against the live feed (company name and job
// locations), because ATS slugs collide: "decagon", "sabi" and "carbon" all
// resolve to unrelated US companies. Verify before adding one.
//
// Being on this list is also a trust signal: these feeds come from the
// employer's own ATS, so scam-check treats them as verified employers.
//
// Many well-known Nigerian employers (Paystack, Flutterwave, Interswitch,
// PiggyVest, Opay) run their own careers pages with no public feed, so they
// are absent here; LinkedIn and HotNigerianJobs pick up much of their hiring.

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'breezy' | 'workday'

export interface CompanyBoard {
  name: string
  ats: Ats
  slug: string
  /** Why this employer is on the list, for anyone maintaining it. */
  note: string
  /** Workday only: the careers host and site, e.g. shell.wd3.myworkdayjobs.com + ShellCareers. */
  host?: string
  site?: string
  /** Narrows a large global board server-side: Workday search text, or a
   *  SmartRecruiters country code. Without it a 700-role board would be
   *  read in full on every search. */
  search?: string
  country?: string
}

export const COMPANY_BOARDS: CompanyBoard[] = [
  // ── Nigerian tech companies ────────────────────────────────────
  { name: 'Moniepoint', ats: 'greenhouse', slug: 'moniepoint', note: 'Nigerian fintech; Lagos plus remote roles in Nigeria and Europe' },
  { name: 'FairMoney', ats: 'workable', slug: 'fairmoney', note: 'Nigerian digital bank; engineering in Lagos' },
  { name: 'Renmoney', ats: 'workable', slug: 'renmoney', note: 'Nigerian lender; Lagos tech team' },
  { name: 'Kuda', ats: 'workable', slug: 'kuda', note: 'Nigerian digital bank' },
  { name: 'PalmPay', ats: 'smartrecruiters', slug: 'palmpay', note: 'Nigerian payments company' },
  { name: 'Vendease', ats: 'smartrecruiters', slug: 'vendease', note: 'Lagos food-procurement startup' },
  { name: 'Raenest', ats: 'smartrecruiters', slug: 'raenest', note: 'Nigerian fintech; remote roles in Nigeria' },
  { name: 'Cowrywise', ats: 'breezy', slug: 'cowrywise', note: 'Nigerian investment app' },
  { name: 'Jumia', ats: 'greenhouse', slug: 'jumia', note: 'Pan-African e-commerce; Lagos tech hub' },
  // ── Africa-focused, hiring across the continent ─────────────────
  { name: 'Paymentology', ats: 'ashby', slug: 'paymentology', note: 'Card processor with African operations' },
  { name: 'LemFi', ats: 'ashby', slug: 'lemfi', note: 'Nigerian-founded remittance company; UK roles, a relocation route' },
  { name: 'Andela', ats: 'ashby', slug: 'andela', note: 'Founded in Lagos; places African engineers with global companies' },
  // ── Abroad, hiring remotely into Nigeria ────────────────────────
  // Kept only where the live board lists roles as Worldwide, Global, EMEA or
  // Africa (checked October 2026). EMEA includes Nigeria; the eligibility
  // classifier still judges each posting, so a US-only role here is marked
  // restricted like anywhere else.
  { name: 'Canonical', ats: 'greenhouse', slug: 'canonical', note: 'Ubuntu; most roles "Home based - Worldwide" or EMEA' },
  { name: 'Supabase', ats: 'ashby', slug: 'supabase', note: 'Fully remote; most roles "Remote, Global"' },
  { name: 'Circle', ats: 'ashby', slug: 'circle', note: 'USDC issuer; many roles EMEA or Anywhere' },
  { name: 'OKX', ats: 'greenhouse', slug: 'okx', note: 'Crypto exchange; remote EMEA roles' },
  { name: 'Consensys', ats: 'greenhouse', slug: 'consensys', note: 'Ethereum tooling; roles open to US or EMEA remote' },
  { name: 'Railway', ats: 'ashby', slug: 'railway', note: 'Infrastructure startup; roles listed Global' },
  { name: 'PostHog', ats: 'ashby', slug: 'posthog', note: 'All-remote; EMEA roles' },
  { name: 'Zapier', ats: 'ashby', slug: 'zapier', note: 'All-remote; some EMEA roles' },
  { name: 'Nansen', ats: 'ashby', slug: 'nansen', note: 'Blockchain analytics; remote EMEA' },
  { name: 'GitLab', ats: 'greenhouse', slug: 'gitlab', note: 'All-remote; some roles list EMEA' },
  { name: 'Turing', ats: 'greenhouse', slug: 'turing', note: 'Global remote engineering marketplace' },
  { name: 'Toptal', ats: 'lever', slug: 'toptal', note: 'Remote talent network; some staff roles Anywhere/EMEA' },
  { name: 'Invisible Technologies', ats: 'greenhouse', slug: 'invisible', note: 'AI-training work; open talent pools listed Worldwide' },
  // ── Energy, engineering and graduate employers ─────────────────
  // Global boards: Nigerian roles appear here when they are posted (the
  // daily job alerts catch them), and roles abroad feed Relocation mode.
  // Shell and Chevron currently list no Nigerian roles; their boards are
  // small enough (~150) to read whole. Baker Hughes (~700) and Unilever are
  // narrowed to Nigeria.
  { name: 'Shell', ats: 'workday', slug: 'shell', host: 'shell.wd3.myworkdayjobs.com', site: 'ShellCareers', note: 'Oil & gas; graduate programmes and engineering roles' },
  { name: 'Chevron', ats: 'workday', slug: 'chevron', host: 'chevron.wd5.myworkdayjobs.com', site: 'jobs', note: 'Oil & gas; engineering roles worldwide' },
  { name: 'Baker Hughes', ats: 'workday', slug: 'bakerhughes', host: 'bakerhughes.wd5.myworkdayjobs.com', site: 'BakerHughes', search: 'Nigeria', note: 'Oilfield services; Port Harcourt and Lagos field roles' },
  { name: 'Unilever', ats: 'workday', slug: 'unilever', host: 'unilever.wd3.myworkdayjobs.com', site: 'Unilever_Experienced_Professionals', search: 'Nigeria', note: 'FMCG; Lagos roles' },
  { name: 'Bosch', ats: 'smartrecruiters', slug: 'BoschGroup', country: 'ng', note: 'Engineering and technology; Nigerian roles only' },
  // ── Relocation ─────────────────────────────────────────────────
  { name: 'Stripe', ats: 'greenhouse', slug: 'stripe', note: "Paystack's parent; sponsors visas for roles abroad" },
]
