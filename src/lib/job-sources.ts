// Remote job boards with public JSON APIs. Remotive and Jobicy publish who may
// apply (candidate_required_location / jobGeo), which is what makes the
// eligibility filter possible at all.
//
// Server-side only: called from API routes, never a Client Component.

// Defined here, not in the optional LinkedIn adapter, so nothing depends on a
// module that may be absent.
export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  seniority: string | null
  employmentType: string | null
  jobFunction: string | null
  industries: string | null
  applyUrl: string | null
}

export interface JobSearchOptions {
  query?: string
  location?: string
  jobage?: number
  remote?: 'remote' | 'hybrid' | 'onsite'
  page?: number
}

export type JobSourceId = 'linkedin' | 'remotive' | 'jobicy' | 'remoteok' | 'arbeitnow'

/** What a posting says about sponsoring a work visa, if anything. */
export type VisaSignal = 'offers' | 'denies' | 'unstated'

/** Whether someone based in Nigeria / Africa may apply. */
export type Eligibility = 'africa-ok' | 'restricted' | 'unknown'

export interface SourcedJob extends JobCard {
  source: JobSourceId
  eligibility: Eligibility
  /** The board's own wording, shown so the user can judge for themselves. */
  eligibilityNote: string | null
  remote: boolean
  /** What the posting says about sponsorship, where a description exists. */
  visa?: VisaSignal
  /** Set by the API when the company holds a UK sponsor licence. */
  ukSponsor?: boolean
  ukSponsorMatchedAs?: string | null
}

export const SOURCE_LABELS: Record<JobSourceId, string> = {
  linkedin:  'LinkedIn',
  remotive:  'Remotive',
  jobicy:    'Jobicy',
  remoteok:  'RemoteOK',
  arbeitnow: 'Arbeitnow',
}

/** Remote boards carry remote work; Arbeitnow carries on-site European roles,
 *  which is where relocation and sponsorship actually apply. */
export const SOURCES_BY_MODE: Record<'remote' | 'relocation', JobSourceId[]> = {
  remote:     ['linkedin', 'remotive', 'jobicy', 'remoteok'],
  relocation: ['linkedin', 'arbeitnow'],
}

const VISA_OFFERS = /(visa sponsorship|sponsor(ship)? (is )?(available|provided|offered)|we (can )?sponsor|will sponsor|relocation (support|assistance|package|bonus)|work permit (support|provided)|tier 2|skilled worker visa)/i
const VISA_DENIES = /(no (visa )?sponsorship|cannot sponsor|unable to sponsor|not (able|in a position) to sponsor|without (visa )?sponsorship|must (already )?(be|have) (authori[sz]ed|eligible) to work|no relocation)/i

/** Denial wins over an offer: a post saying both usually means "we sponsor
 *  some roles, not this one". */
export function detectVisaSignal(text?: string | null): VisaSignal {
  if (!text) return 'unstated'
  if (VISA_DENIES.test(text)) return 'denies'
  if (VISA_OFFERS.test(text)) return 'offers'
  return 'unstated'
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HireKit/1.0'
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' }

// EMEA expands to Europe, Middle East and Africa, so it counts as open.
const OPEN_TO_AFRICA = /\b(africa|african|nigeria|nigerian|kenya|ghana|egypt|emea)\b/i
const OPEN_TO_ANYONE = /\b(worldwide|anywhere|global|international|any location|remote, world)\b/i

/** Whether a board's location string includes Africa. Conservative: named
 *  regions without Africa count as restricted. */
export function classifyEligibility(raw?: string | null): { level: Eligibility; note: string | null } {
  const s = (raw ?? '').trim()
  if (!s) return { level: 'unknown', note: null }
  if (OPEN_TO_AFRICA.test(s)) return { level: 'africa-ok', note: s }
  if (OPEN_TO_ANYONE.test(s)) return { level: 'africa-ok', note: s }
  return { level: 'restricted', note: s }
}

function isoDate(input?: string | number | null): string | null {
  if (input === null || input === undefined || input === '') return null
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function stripHtml(s?: string | null): string | null {
  if (!s) return null
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
}

/** Per-source timeout so one slow board cannot stall the search. */
async function getJson(url: string, ms = 9000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ── Remotive ──────────────────────────────────────────────────────
interface RemotiveJob {
  id: number; url: string; title: string; company_name: string
  candidate_required_location?: string; publication_date?: string
  job_type?: string; description?: string
}

async function fromRemotive(query: string): Promise<SourcedJob[]> {
  const data = await getJson(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=50`,
  ) as { jobs?: RemotiveJob[] }

  return (data.jobs ?? []).map(j => {
    const el = classifyEligibility(j.candidate_required_location)
    return {
      id: `remotive:${j.id}`,
      title: j.title,
      company: j.company_name ?? null,
      companyUrl: null,
      location: j.candidate_required_location ?? 'Remote',
      date: isoDate(j.publication_date),
      url: j.url,
      source: 'remotive' as const,
      eligibility: el.level,
      eligibilityNote: el.note,
      remote: true,
    }
  })
}

// ── Jobicy ────────────────────────────────────────────────────────
interface JobicyJob {
  id: number; url: string; jobTitle: string; companyName: string
  jobGeo?: string; pubDate?: string; jobExcerpt?: string
}

async function fromJobicy(query: string): Promise<SourcedJob[]> {
  const data = await getJson(
    `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(query)}`,
  ) as { jobs?: JobicyJob[] }

  return (data.jobs ?? []).map(j => {
    const el = classifyEligibility(j.jobGeo)
    return {
      id: `jobicy:${j.id}`,
      title: j.jobTitle,
      company: j.companyName ?? null,
      companyUrl: null,
      location: j.jobGeo ?? 'Remote',
      date: isoDate(j.pubDate),
      url: j.url,
      source: 'jobicy' as const,
      eligibility: el.level,
      eligibilityNote: el.note,
      remote: true,
    }
  })
}

// ── RemoteOK ──────────────────────────────────────────────────────
interface RemoteOkJob {
  id: string; slug?: string; position?: string; company?: string
  location?: string; date?: string; url?: string; apply_url?: string
  tags?: string[]; description?: string
}

async function fromRemoteOk(query: string): Promise<SourcedJob[]> {
  // No search param: returns the whole board. Element 0 is a legal notice.
  const all = await getJson('https://remoteok.com/api') as RemoteOkJob[]
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  return (Array.isArray(all) ? all.slice(1) : [])
    .filter(j => {
      // Any term, not all; filterRelevant tightens this afterwards.
      const hay = `${j.position ?? ''} ${j.company ?? ''} ${(j.tags ?? []).join(' ')}`.toLowerCase()
      return terms.some(t => hay.includes(t))
    })
    .slice(0, 50)
    .map(j => {
      const el = classifyEligibility(j.location)
      return {
        id: `remoteok:${j.id}`,
        title: j.position ?? '(untitled)',
        company: j.company ?? null,
        companyUrl: null,
        location: j.location?.trim() || 'Remote',
        date: isoDate(j.date),
        url: j.url ?? j.apply_url ?? `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
        source: 'remoteok' as const,
        eligibility: el.level,
        eligibilityNote: el.note,
        remote: true,
      }
    })
}


// ── Arbeitnow ─────────────────────────────────────────────────────
// Mostly on-site European roles, which is why it carries the relocation mode:
// the remote boards are ~0% on visa talk, Arbeitnow postings mention it a few
// percent of the time because relocating is actually on the table.
interface ArbeitnowJob {
  slug: string; company_name: string; title: string; description?: string
  remote?: boolean; url: string; location?: string; created_at?: number
  tags?: string[]
}

async function fromArbeitnow(query: string): Promise<SourcedJob[]> {
  const data = await getJson('https://www.arbeitnow.com/api/job-board-api') as { data?: ArbeitnowJob[] }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  return (data.data ?? [])
    .filter(j => {
      const hay = `${j.title ?? ''} ${j.company_name ?? ''} ${(j.tags ?? []).join(' ')}`.toLowerCase()
      return terms.length === 0 || terms.some(t => hay.includes(t))
    })
    .slice(0, 60)
    .map(j => {
      // Arbeitnow publishes where the job is, not who may apply, so
      // eligibility stays unknown and the visa signal does the work here.
      const el = classifyEligibility(j.location)
      return {
        id: `arbeitnow:${j.slug}`,
        title: j.title,
        company: j.company_name ?? null,
        companyUrl: null,
        location: j.location ?? null,
        date: isoDate(j.created_at ?? null),
        url: j.url,
        source: 'arbeitnow' as const,
        eligibility: el.level === 'africa-ok' ? 'africa-ok' : 'unknown' as Eligibility,
        eligibilityNote: j.location ?? null,
        remote: !!j.remote,
        visa: detectVisaSignal(`${j.title ?? ''} ${j.description ?? ''}`),
      }
    })
}

// ── Aggregate ─────────────────────────────────────────────────────
const ADAPTERS: Record<Exclude<JobSourceId, 'linkedin'>, (q: string) => Promise<SourcedJob[]>> = {
  remotive: fromRemotive,
  jobicy: fromJobicy,
  remoteok: fromRemoteOk,
  arbeitnow: fromArbeitnow,
}

export interface SourceOutcome {
  source: JobSourceId
  ok: boolean
  count: number
  error?: string
}

/** Queries the boards in parallel; failures are isolated and reported. */
export async function searchRemoteBoards(
  query: string,
  only?: JobSourceId[],
): Promise<{ jobs: SourcedJob[]; outcomes: SourceOutcome[] }> {
  const all = Object.keys(ADAPTERS) as Exclude<JobSourceId, 'linkedin'>[]
  const ids = only ? all.filter(id => only.includes(id)) : all
  const settled = await Promise.allSettled(ids.map(id => ADAPTERS[id](query)))

  const jobs: SourcedJob[] = []
  const outcomes: SourceOutcome[] = []

  settled.forEach((res, i) => {
    const source = ids[i]
    if (res.status === 'fulfilled') {
      jobs.push(...res.value)
      outcomes.push({ source, ok: true, count: res.value.length })
    } else {
      outcomes.push({
        source, ok: false, count: 0,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      })
    }
  })

  return { jobs, outcomes }
}

/** Re-filters board results against the query — the boards match loosely. */
export function filterRelevant(jobs: SourcedJob[], query: string): SourcedJob[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3)
  if (!terms.length) return jobs
  return jobs.filter(j => {
    const hay = `${j.title} ${j.company ?? ''}`.toLowerCase()
    return terms.some(t => hay.includes(t))
  })
}

/** Same role cross-posted to several boards collapses to one row. */
export function dedupe(jobs: SourcedJob[]): SourcedJob[] {
  const seen = new Set<string>()
  const out: SourcedJob[] = []
  for (const j of jobs) {
    const key = `${(j.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}|${(j.company ?? '').toLowerCase().trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(j)
  }
  return out
}

export { stripHtml }
