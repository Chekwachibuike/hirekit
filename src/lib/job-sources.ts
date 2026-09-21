// Extra job sources for the search pool, alongside the LinkedIn scraper.
//
// Chosen because each is a curated board with a public JSON API — human-posted
// listings from named companies, not a scraper aggregating other scrapers. The
// deciding factor was that Remotive and Jobicy publish WHO MAY APPLY as a
// field, which is what makes "can a Nigerian actually take this job?" an
// answerable question rather than a guess:
//
//   Remotive  candidate_required_location  "Worldwide" | "USA, Canada" | "Europe"
//   Jobicy    jobGeo                       "Anywhere"  | "USA" | "EMEA"
//   RemoteOK  location                     often blank, sometimes a country
//
// That matters more than it sounds. A sample of Remotive's "developer" results
// was 6 "Worldwide" out of 18 — the rest listed regions like "Northern America,
// LATAM, Europe, APAC", which quietly excludes Africa. Showing those unfiltered
// would mean most results are jobs the user cannot apply for.
//
// Server-side only: called from API routes, never a Client Component.
import type { JobCard } from './linkedin'

export type JobSourceId = 'linkedin' | 'remotive' | 'jobicy' | 'remoteok'

/** Whether someone based in Nigeria / Africa may apply. */
export type Eligibility = 'africa-ok' | 'restricted' | 'unknown'

export interface SourcedJob extends JobCard {
  source: JobSourceId
  eligibility: Eligibility
  /** The board's own wording, shown so the user can judge for themselves. */
  eligibilityNote: string | null
  remote: boolean
}

export const SOURCE_LABELS: Record<JobSourceId, string> = {
  linkedin: 'LinkedIn',
  remotive: 'Remotive',
  jobicy:   'Jobicy',
  remoteok: 'RemoteOK',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HireKit/1.0'
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' }

// EMEA expands to Europe, Middle East and Africa, so it counts as open.
const OPEN_TO_AFRICA = /\b(africa|african|nigeria|nigerian|kenya|ghana|egypt|emea)\b/i
const OPEN_TO_ANYONE = /\b(worldwide|anywhere|global|international|any location|remote, world)\b/i

/**
 * Reads a board's location string and decides whether Africa is included.
 *
 * Deliberately conservative: anything that names specific regions without
 * Africa among them is treated as restricted, because the failure that matters
 * is wasting an application, not missing a borderline listing.
 */
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

/** Per-source timeout, so one slow board cannot hold up the whole search. */
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
  // Returns the whole board and has no search parameter, so filtering is ours
  // to do. Element 0 is a legal notice, not a job.
  const all = await getJson('https://remoteok.com/api') as RemoteOkJob[]
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  return (Array.isArray(all) ? all.slice(1) : [])
    .filter(j => {
      const hay = `${j.position ?? ''} ${j.company ?? ''} ${(j.tags ?? []).join(' ')}`.toLowerCase()
      // Any term, not all: "react developer" should still find a role titled
      // "Frontend Engineer" tagged react. filterRelevant tightens this after.
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

// ── Aggregate ─────────────────────────────────────────────────────
const ADAPTERS: Record<Exclude<JobSourceId, 'linkedin'>, (q: string) => Promise<SourcedJob[]>> = {
  remotive: fromRemotive,
  jobicy: fromJobicy,
  remoteok: fromRemoteOk,
}

export interface SourceOutcome {
  source: JobSourceId
  ok: boolean
  count: number
  error?: string
}

/**
 * Queries the remote boards in parallel. Failures are isolated and reported
 * rather than thrown: one board being down should narrow the results, not
 * break the search.
 */
export async function searchRemoteBoards(
  query: string,
): Promise<{ jobs: SourcedJob[]; outcomes: SourceOutcome[] }> {
  const ids = Object.keys(ADAPTERS) as Exclude<JobSourceId, 'linkedin'>[]
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

/**
 * Re-filters board results against the query.
 *
 * Necessary because the boards match loosely: Remotive answered "react
 * developer" with "Freelance Writer", "Remote Office Assistant" and "Inside
 * Sales Contractor". Since those happened to be the Worldwide ones, an
 * Africa-eligible list built without this would be mostly jobs the user never
 * searched for — which reads as the filter being broken.
 */
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
