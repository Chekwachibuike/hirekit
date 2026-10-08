// Employers worth watching directly as a Nigerian developer: Nigerian tech
// companies, and remote-first ones whose roles are open to Nigeria. Each
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

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'breezy'

export interface CompanyBoard {
  name: string
  ats: Ats
  slug: string
  /** Why this employer is on the list, for anyone maintaining it. */
  note: string
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
  // ── Relocation ─────────────────────────────────────────────────
  { name: 'Stripe', ats: 'greenhouse', slug: 'stripe', note: "Paystack's parent; sponsors visas for roles abroad" },
]
