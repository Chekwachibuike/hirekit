// Job sources with public feeds. Remotive, Jobicy, Himalayas and We Work
// Remotely publish who may apply (candidate_required_location / jobGeo /
// locationRestrictions / region), which is what makes the eligibility filter
// possible at all. HotNigerianJobs and the company boards add jobs based in
// Nigeria itself.
//
// Server-side only: called from API routes, never a Client Component.

import { COMPANY_BOARDS, type CompanyBoard } from './company-boards'

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
  /** Which board produced this, so the UI names the right site. */
  source?: JobSourceId
  description: string | null
  seniority: string | null
  employmentType: string | null
  jobFunction: string | null
  industries: string | null
  applyUrl: string | null
}

export type Workplace = 'remote' | 'hybrid' | 'onsite'

export interface JobSearchOptions {
  query?: string
  location?: string
  jobage?: number
  remote?: Workplace
  page?: number
}

export type JobSourceId =
  | 'linkedin' | 'remotive' | 'jobicy' | 'remoteok' | 'arbeitnow'
  | 'himalayas' | 'workingnomads' | 'weworkremotely' | 'hotnigerianjobs' | 'jobzilla' | 'companies'

export const ALL_SOURCES: JobSourceId[] = [
  'linkedin', 'remotive', 'jobicy', 'remoteok', 'arbeitnow',
  'himalayas', 'workingnomads', 'weworkremotely', 'hotnigerianjobs', 'jobzilla', 'companies',
]

/** remote: work from Nigeria for anyone. nigeria: jobs based in Nigeria.
 *  relocation: on-site roles abroad, where sponsorship matters. */
export type SearchMode = 'remote' | 'nigeria' | 'relocation'

/** What a posting says about sponsoring a work visa, if anything. */
export type VisaSignal = 'offers' | 'denies' | 'unstated'

/** Whether someone based in Nigeria may apply. */
export type Eligibility = 'africa-ok' | 'restricted' | 'unknown'

export interface SourcedJob extends JobCard {
  source: JobSourceId
  eligibility: Eligibility
  /** The board's own wording, shown so the user can judge for themselves. */
  eligibilityNote: string | null
  workplace: Workplace
  remote: boolean
  /** What the posting says about sponsorship, where a description exists. */
  visa?: VisaSignal
  /** Board tags. A speciality like "react" usually lives here, not in the
   *  title, so relevance matching reads them too. */
  keywords?: string[]
  /** Posting body, where the board returns one. Stripped of markup and
   *  capped, so it can ride along with every search result. */
  description?: string | null
  /** Set by the API when the company holds a UK sponsor licence. */
  ukSponsor?: boolean
  ukSponsorMatchedAs?: string | null
}

export const SOURCE_LABELS: Record<JobSourceId, string> = {
  linkedin:        'LinkedIn',
  remotive:        'Remotive',
  jobicy:          'Jobicy',
  remoteok:        'RemoteOK',
  arbeitnow:       'Arbeitnow',
  himalayas:       'Himalayas',
  workingnomads:   'Working Nomads',
  weworkremotely:  'We Work Remotely',
  hotnigerianjobs: 'HotNigerianJobs',
  jobzilla:        'Jobzilla',
  companies:       'Company boards',
}

/** Remote boards carry remote work; HotNigerianJobs carries jobs in Nigeria;
 *  Arbeitnow carries on-site European roles, which is where relocation and
 *  sponsorship actually apply. The company boards span all three, and
 *  applyFilters keeps the part that fits the mode. */
export const SOURCES_BY_MODE: Record<SearchMode, JobSourceId[]> = {
  remote:     ['linkedin', 'himalayas', 'remotive', 'jobicy', 'remoteok', 'workingnomads', 'weworkremotely', 'companies'],
  nigeria:    ['linkedin', 'hotnigerianjobs', 'jobzilla', 'companies'],
  relocation: ['linkedin', 'arbeitnow', 'companies'],
}

const VISA_OFFERS = /(visa sponsorship|sponsor(ship)? (is )?(available|provided|offered)|we (can )?sponsor|will sponsor|relocation (support|assistance|package|bonus)|work permit (support|provided)|tier 2|skilled worker visa)/i
const VISA_DENIES = /(no (visa )?sponsorship|cannot sponsor|unable to sponsor|not (able|in a position) to sponsor|without (visa )?sponsorship|must (already )?(be|have) (authori[sz]ed|eligible) to work|no relocation)/i

/** Denial wins over an offer: a post saying both usually means "we sponsor
 *  some roles, not this one". */
export function detectVisaSignal(text?: string | null): VisaSignal {
  if (!text) return 'unstated'
  if (VISA_DENIES.test(text)) return 'denies'
  if (VISA_OFFERS.test(text)) return 'offers'
  return 'unstated'
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HireKit/1.0'

// ── Eligibility ───────────────────────────────────────────────────

/** Nigeria and its tech cities. Locations name a city more often than the
 *  country ("Lagos", "Ikoyi"), so the country alone would miss most of them. */
const NIGERIA = /\b(nigeria|nigerian|lagos|abuja|ibadan|port harcourt|kano|kaduna|enugu|benin city|ikeja|ikoyi|lekki|victoria island|yaba|owerri|uyo|calabar|ilorin|abeokuta|onitsha|akure|warri)\b/i

/** Sub-regions of Africa that do not include Nigeria. Stripped before the
 *  region test, or "South Africa" would read as open to Africa. */
const OTHER_AFRICAN_REGIONS = /\b(south|southern|north|northern|east|eastern|central)\s+africa\b/gi

// EMEA expands to Europe, Middle East and Africa, so it counts as open.
const OPEN_REGION = /\b(africa|african|emea)\b/i
const WORLDWIDE = /\b(worldwide|world ?wide|anywhere|global|globally|international|internationally|any location|all countries|all locations)\b/i

/** "Anywhere in India" names one country; only the world or a region that
 *  contains Nigeria makes "anywhere" mean open. */
const ANYWHERE_IN = /\banywhere in (?!(?:the )?(?:world|africa|emea)\b)(?:the )?[a-z]+/gi

/** "Worldwide except Africa", "not open to Nigeria". */
const EXCLUDES = /\b(except|excluding|excludes|not (?:open )?(?:to|in|from)|outside(?: of)?)\b[^.;]*\b(africa|nigeria|emea)\b/i

/** Says nothing about who may apply. */
const NO_INFO = /^(remote|fully remote|100% remote|remote[- ]first|work from home|wfh|n\/a|tbd|various|multiple locations|flexible)$/i

/** Time-zone-only constraints ("CET +/- 3 hours") limit hours, not
 *  citizenship. Nigeria is UTC+1, so they are often workable. */
const TIMEZONE_ONLY = /^(?:[^a-z]*|.*\b(?:time ?zones?|utc|gmt|cet|cest|wat|hours?)\b.*)$/i
const NAMES_PLACE = /\b(us|usa|u\.s\.|united states|canada|uk|united kingdom|europe|eu|latam|latin america|apac|asia|india|australia|americas|north america|germany|brazil|mexico)\b/i

/** Whether a location string lets a Nigeria-based applicant apply.
 *  Conservative: a list of named places without Nigeria counts as
 *  restricted, including other African countries — "Kenya" alone does not
 *  admit someone in Lagos. */
export function classifyEligibility(raw?: string | null): { level: Eligibility; note: string | null } {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return { level: 'unknown', note: null }
  if (EXCLUDES.test(s)) return { level: 'restricted', note: s }
  if (NIGERIA.test(s)) return { level: 'africa-ok', note: s }

  const scrubbed = s.replace(OTHER_AFRICAN_REGIONS, ' ').replace(ANYWHERE_IN, ' ')
  if (OPEN_REGION.test(scrubbed)) return { level: 'africa-ok', note: s }
  if (WORLDWIDE.test(scrubbed)) return { level: 'africa-ok', note: s }

  if (NO_INFO.test(s)) return { level: 'unknown', note: s }
  if (TIMEZONE_ONLY.test(s) && !NAMES_PLACE.test(s)) return { level: 'unknown', note: s }
  return { level: 'restricted', note: s }
}

export function isInNigeria(location?: string | null): boolean {
  return !!location && NIGERIA.test(location)
}

/** Reads the workplace from whatever text the board gives. Hybrid is checked
 *  first: "Hybrid (remote 3 days)" is hybrid, not remote. */
export function inferWorkplace(...texts: (string | null | undefined)[]): Workplace {
  const s = texts.filter(Boolean).join(' ')
  if (/\bhybrid\b/i.test(s)) return 'hybrid'
  if (/\b(remote|work from home|wfh|home[- ]based|anywhere|distributed)\b/i.test(s)) return 'remote'
  return 'onsite'
}

// ── Fetching ──────────────────────────────────────────────────────

function isoDate(input?: string | number | null): string | null {
  if (input === null || input === undefined || input === '') return null
  const d = typeof input === 'number'
    // Seconds or milliseconds: anything past 1e12 is already milliseconds.
    ? new Date(input > 1e12 ? input : input * 1000)
    : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

function stripHtml(s?: string | null): string | null {
  if (!s) return null
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
}

/** Board descriptions arrive as HTML and can run to tens of kilobytes. Strip
 *  the markup and cap the length: this travels with every search result, and
 *  the fit analysis does not need more than this. */
const DESCRIPTION_LIMIT = 5000
function summarise(raw?: string | null): string | null {
  if (!raw) return null
  // Keep paragraph and list structure as line breaks: the detail panel
  // renders with pre-wrap, and collapsing everything to spaces turned every
  // posting into one unbroken wall of text.
  const text = decodeEntities(
    raw
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|ul|ol|h[1-6]|tr|section)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return null
  return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT)}…` : text
}

// Whole-board feeds (RemoteOK, Arbeitnow, the RSS feeds and every company
// board) return the same payload whatever was searched, and Workable
// rate-limits bursts. Caching them for a while makes repeat searches cheap
// and keeps the app from hammering anyone's servers.
const CACHE_MS = 15 * 60 * 1000
const cache = new Map<string, { at: number; body: Promise<string> }>()

async function fetchText(url: string, accept: string, ms = 9000, init?: RequestInit): Promise<string> {
  const key = `${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body

  const body = (async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': UA, Accept: accept, ...(init?.headers ?? {}) },
        signal: ctrl.signal,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } finally {
      clearTimeout(timer)
    }
  })()
  cache.set(key, { at: Date.now(), body })
  // A failure must not be cached, or one timeout blanks the source for 15 min.
  body.catch(() => cache.delete(key))
  return body
}

/** Per-source timeout so one slow board cannot stall the search. */
async function getJson(url: string, ms?: number, init?: RequestInit): Promise<unknown> {
  const text = await fetchText(url, 'application/json', ms, init)
  try {
    return JSON.parse(text)
  } catch {
    // Rate limiters and bot checks answer 200 with an HTML page.
    throw new Error('unexpected non-JSON response')
  }
}

interface RssItem { title: string; link: string; description: string; pubDate: string; region: string }

function rssField(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? decodeEntities(m[1]).trim() : ''
}

async function getRss(url: string): Promise<RssItem[]> {
  const xml = await fetchText(url, 'application/rss+xml, application/xml, text/xml')
  return xml.split(/<item[\s>]/i).slice(1).map(item => ({
    title: rssField(item, 'title'),
    link: rssField(item, 'link') || rssField(item, 'guid'),
    description: rssField(item, 'description'),
    pubDate: rssField(item, 'pubDate'),
    region: rssField(item, 'region'),
  }))
}

/** Pre-filter for whole-board feeds, before filterRelevant decides properly:
 *  any meaningful term, so a 600-item feed is not carried through whole. */
function looselyMatches(query: string, ...texts: (string | null | undefined)[]): boolean {
  const terms = meaningfulTerms(query)
  if (!terms.length) return true
  const hay = canonicalise(texts.filter(Boolean).join(' '))
  return terms.some(t => expandTerm(t).some(a => hay.includes(a)))
}

// ── Remotive ──────────────────────────────────────────────────────
interface RemotiveJob {
  id: number; url: string; title: string; company_name: string
  candidate_required_location?: string; publication_date?: string
  job_type?: string; description?: string; tags?: string[]
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
      description: summarise(j.description),
      keywords: j.tags ?? [],
      eligibility: el.level,
      eligibilityNote: el.note,
      workplace: 'remote' as const,
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
      title: decodeEntities(j.jobTitle),
      company: j.companyName ?? null,
      companyUrl: null,
      location: j.jobGeo ?? 'Remote',
      date: isoDate(j.pubDate),
      url: j.url,
      source: 'jobicy' as const,
      description: summarise(j.jobExcerpt),
      eligibility: el.level,
      eligibilityNote: el.note,
      workplace: 'remote' as const,
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

  return (Array.isArray(all) ? all.slice(1) : [])
    .filter(j => looselyMatches(query, j.position, j.company, (j.tags ?? []).join(' ')))
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
        description: summarise(j.description),
        keywords: j.tags ?? [],
        eligibility: el.level,
        eligibilityNote: el.note,
        workplace: 'remote' as const,
        remote: true,
      }
    })
}

// ── Himalayas ─────────────────────────────────────────────────────
// The best-structured remote board: every posting lists the countries it
// accepts, and country=NG returns exactly the worldwide ones plus those that
// name Nigeria, so eligibility is a fact rather than a parse.
interface HimalayasJob {
  title: string; companyName: string; excerpt?: string; description?: string
  employmentType?: string; seniority?: string[]; categories?: string[]
  locationRestrictions?: string[]; pubDate?: number; applicationLink?: string; guid: string
}

async function fromHimalayas(query: string): Promise<SourcedJob[]> {
  const data = await getJson(
    `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&country=NG&limit=50`,
  ) as { jobs?: HimalayasJob[] }

  return (data.jobs ?? []).map(j => {
    const where = j.locationRestrictions ?? []
    // An empty list means the employer accepts any country.
    const open = where.length === 0 || where.includes('Nigeria')
    const note = where.length === 0
      ? 'Worldwide'
      : where.length > 6 ? `${where.slice(0, 6).join(', ')} +${where.length - 6} more` : where.join(', ')
    return {
      id: `himalayas:${j.guid}`,
      title: j.title,
      company: j.companyName ?? null,
      companyUrl: null,
      location: note,
      date: isoDate(j.pubDate ?? null),
      url: j.applicationLink ?? j.guid,
      source: 'himalayas' as const,
      description: summarise(j.description ?? j.excerpt),
      keywords: (j.categories ?? []).map(c => c.replace(/-/g, ' ')),
      eligibility: open ? 'africa-ok' as const : 'restricted' as const,
      eligibilityNote: note,
      workplace: 'remote' as const,
      remote: true,
    }
  })
}

// ── Working Nomads ────────────────────────────────────────────────
interface WorkingNomadsJob {
  url: string; title: string; description?: string; company_name?: string
  category_name?: string; tags?: string; location?: string; pub_date?: string
}

async function fromWorkingNomads(query: string): Promise<SourcedJob[]> {
  // Whole feed, no search parameter.
  const all = await getJson('https://www.workingnomads.com/api/exposed_jobs/') as WorkingNomadsJob[]

  return (Array.isArray(all) ? all : [])
    .filter(j => looselyMatches(query, j.title, j.tags, j.category_name))
    .map(j => {
      const el = classifyEligibility(j.location)
      return {
        id: `workingnomads:${j.url}`,
        title: j.title,
        company: j.company_name ?? null,
        companyUrl: null,
        location: j.location ?? 'Remote',
        date: isoDate(j.pub_date),
        url: j.url,
        source: 'workingnomads' as const,
        description: summarise(j.description),
        keywords: (j.tags ?? '').split(',').map(t => t.trim()).filter(Boolean),
        eligibility: el.level,
        eligibilityNote: el.note,
        workplace: 'remote' as const,
        remote: true,
      }
    })
}

// ── We Work Remotely ──────────────────────────────────────────────
// RSS per category. Titles read "Company: Role"; <region> is who may apply.
const WWR_FEEDS = [
  'remote-full-stack-programming-jobs',
  'remote-back-end-programming-jobs',
  'remote-front-end-programming-jobs',
  'remote-devops-sysadmin-jobs',
  'remote-programming-jobs',
]

async function fromWeWorkRemotely(query: string): Promise<SourcedJob[]> {
  const settled = await Promise.allSettled(
    WWR_FEEDS.map(f => getRss(`https://weworkremotely.com/categories/${f}.rss`)),
  )
  const items = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  if (!items.length && settled.every(r => r.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult).reason
  }

  return items
    .filter(i => looselyMatches(query, i.title))
    .map(i => {
      const colon = i.title.indexOf(': ')
      const company = colon > 0 ? i.title.slice(0, colon) : null
      const title = colon > 0 ? i.title.slice(colon + 2) : i.title
      const el = classifyEligibility(i.region)
      return {
        id: `weworkremotely:${i.link}`,
        title,
        company,
        companyUrl: null,
        location: i.region || 'Remote',
        date: isoDate(i.pubDate),
        url: i.link,
        source: 'weworkremotely' as const,
        description: summarise(i.description),
        eligibility: el.level,
        eligibilityNote: el.note,
        workplace: 'remote' as const,
        remote: true,
      }
    })
}

// ── Nigerian job boards (RSS) ─────────────────────────────────────
// HotNigerianJobs (Nigeria's largest general board) and Jobzilla, via their
// public feeds. Every job is in Nigeria; titles read "Role at Company".
//
// Both also post one item per employer covering several roles: "Propetrol
// Limited Job Recruitment (3 Positions)". The roles are only named in the
// description, so for those the description's opening counts as keywords;
// otherwise a "graduate trainee" opening inside one would never match.
const MULTI_ROLE = /\b(recruitment|positions|vacancies|job opportunities|openings|hiring)\b/i

function fromNigerianRss(source: 'hotnigerianjobs' | 'jobzilla', url: string) {
  return async (query: string): Promise<SourcedJob[]> => {
    const items = await getRss(url)
    return items
      .map(i => {
        const roles = MULTI_ROLE.test(i.title) ? (stripHtml(i.description) ?? '').slice(0, 600) : ''
        return { i, roles }
      })
      .filter(({ i, roles }) => looselyMatches(query, i.title, roles))
      .map(({ i, roles }) => {
        const m = i.title.match(/^(.*) at (.+)$/)
        const workplace = inferWorkplace(i.title)
        return {
          id: `${source}:${i.link}`,
          title: m ? m[1].trim() : i.title,
          company: m ? m[2].trim() : null,
          companyUrl: null,
          location: 'Nigeria',
          date: isoDate(i.pubDate),
          url: i.link,
          source,
          description: summarise(i.description),
          keywords: roles ? roles.split(/[\s,;:()]+/).filter(w => w.length > 2) : undefined,
          eligibility: 'africa-ok' as const,
          eligibilityNote: 'Based in Nigeria',
          workplace,
          remote: workplace === 'remote',
        }
      })
  }
}

const fromHotNigerianJobs = fromNigerianRss('hotnigerianjobs', 'https://www.hotnigerianjobs.com/feed/rss.xml')
const fromJobzilla = fromNigerianRss('jobzilla', 'https://www.jobzilla.ng/feed')

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

  return (data.data ?? [])
    .filter(j => looselyMatches(query, j.title, j.company_name, (j.tags ?? []).join(' ')))
    .slice(0, 60)
    .map(j => {
      // Arbeitnow publishes where the job is, not who may apply, so
      // eligibility stays unknown and the visa signal does the work here.
      const el = classifyEligibility(j.location)
      const workplace: Workplace = j.remote ? 'remote' : inferWorkplace(j.title) === 'hybrid' ? 'hybrid' : 'onsite'
      return {
        id: `arbeitnow:${j.slug}`,
        title: j.title,
        company: j.company_name ?? null,
        companyUrl: null,
        location: j.location ?? null,
        date: isoDate(j.created_at ?? null),
        url: j.url,
        source: 'arbeitnow' as const,
        description: summarise(j.description),
        keywords: j.tags ?? [],
        eligibility: el.level === 'africa-ok' ? 'africa-ok' : 'unknown' as Eligibility,
        eligibilityNote: j.location ?? null,
        workplace,
        remote: workplace === 'remote',
        visa: detectVisaSignal(`${j.title ?? ''} ${j.description ?? ''}`),
      }
    })
}

// ── Company boards ────────────────────────────────────────────────
// One normalised shape per ATS, then the same treatment for all of them.
interface RawPosting {
  id: string; title: string; location: string; date: string | null
  url: string; workplace: Workplace; description?: string | null
}

const COUNTRY_CODES: Record<string, string> = { ng: 'Nigeria', gb: 'United Kingdom', us: 'United States', ke: 'Kenya', gh: 'Ghana', za: 'South Africa' }
const country = (c?: string | null) => (c ? COUNTRY_CODES[c.toLowerCase()] ?? c : '')
const joinLoc = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ')

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago". */
function workdayPosted(s?: string): string | null {
  if (!s) return null
  const days = /today/i.test(s) ? 0 : /yesterday/i.test(s) ? 1 : Number(s.match(/(\d+)\+?\s+days?/i)?.[1] ?? NaN)
  if (Number.isNaN(days)) return null
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

/** Workday writes Nigerian sites as "NG-PORT HARCOURT-125 TRANS-AMADI";
 *  turn the country code into a name so location filters can read it. */
function workdayLocation(s?: string): string {
  const t = (s ?? '').trim()
  const m = t.match(/^([A-Z]{2})-([^-]+)/)
  if (m) return joinLoc(m[2].replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase()), country(m[1]))
  return t
}

async function readBoard(b: CompanyBoard): Promise<RawPosting[]> {
  switch (b.ats) {
    case 'greenhouse': {
      const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`) as {
        jobs?: { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string; updated_at?: string }[]
      }
      return (d.jobs ?? []).map(j => {
        const location = j.location?.name ?? ''
        return {
          id: String(j.id), title: j.title, location, url: j.absolute_url,
          date: isoDate(j.first_published ?? j.updated_at), workplace: inferWorkplace(location),
        }
      })
    }
    case 'lever': {
      const d = await getJson(`https://api.lever.co/v0/postings/${b.slug}?mode=json`) as {
        id: string; text: string; hostedUrl: string; createdAt?: number; workplaceType?: string
        categories?: { location?: string }; descriptionPlain?: string
      }[]
      return (Array.isArray(d) ? d : []).map(j => {
        const location = j.categories?.location ?? ''
        const wt = j.workplaceType
        return {
          id: j.id, title: j.text, location, url: j.hostedUrl, date: isoDate(j.createdAt ?? null),
          workplace: wt === 'remote' ? 'remote' : wt === 'hybrid' ? 'hybrid' : wt === 'on-site' ? 'onsite' : inferWorkplace(location),
          description: j.descriptionPlain,
        }
      })
    }
    case 'ashby': {
      const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}`) as {
        jobs?: { id: string; title: string; location?: string; isListed?: boolean; isRemote?: boolean
          workplaceType?: string; publishedAt?: string; jobUrl: string; descriptionPlain?: string
          secondaryLocations?: { location?: string }[] }[]
      }
      return (d.jobs ?? []).filter(j => j.isListed !== false).map(j => {
        const location = joinLoc(j.location, ...(j.secondaryLocations ?? []).map(s => s.location))
        const wt = j.workplaceType?.toLowerCase()
        return {
          id: j.id, title: j.title, location, url: j.jobUrl, date: isoDate(j.publishedAt),
          workplace: wt === 'hybrid' ? 'hybrid' : wt === 'remote' || j.isRemote ? 'remote' : 'onsite',
          description: j.descriptionPlain,
        }
      })
    }
    case 'workable': {
      const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${b.slug}`) as {
        jobs?: { shortcode: string; title: string; url: string; city?: string; country?: string
          telecommuting?: boolean; published_on?: string; created_at?: string }[]
      }
      return (d.jobs ?? []).map(j => ({
        id: j.shortcode, title: j.title, location: joinLoc(j.city, j.country), url: j.url,
        date: isoDate(j.published_on ?? j.created_at),
        workplace: j.telecommuting ? 'remote' : inferWorkplace(j.title) === 'hybrid' ? 'hybrid' : 'onsite',
      }))
    }
    case 'smartrecruiters': {
      const q = b.country ? `?country=${encodeURIComponent(b.country)}&limit=100` : ''
      const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${b.slug}/postings${q}`) as {
        content?: { id: string; name: string; releasedDate?: string; company?: { identifier?: string }
          location?: { city?: string; country?: string; remote?: boolean; hybrid?: boolean } }[]
      }
      return (d.content ?? []).map(j => ({
        id: j.id, title: j.name,
        location: joinLoc(j.location?.remote ? 'Remote' : null, j.location?.city, country(j.location?.country)),
        url: `https://jobs.smartrecruiters.com/${j.company?.identifier ?? b.slug}/${j.id}`,
        date: isoDate(j.releasedDate),
        workplace: j.location?.remote ? 'remote' : j.location?.hybrid ? 'hybrid' : 'onsite',
      }))
    }
    case 'workday': {
      // Public endpoint behind every *.myworkdayjobs.com careers site. Pages
      // of 20; the first answers how many there are, the rest load together.
      if (!b.host || !b.site) return []
      const api = `https://${b.host}/wday/cxs/${b.slug}/${b.site}/jobs`
      type Page = { total?: number; jobPostings?: { title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }[] }
      const page = (offset: number) => getJson(api, 12000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: b.search ?? '' }),
      }) as Promise<Page>
      const first = await page(0)
      const total = Math.min(first.total ?? 0, 200)
      const rest = await Promise.allSettled(
        Array.from({ length: Math.max(0, Math.ceil(total / 20) - 1) }, (_, k) => page((k + 1) * 20)),
      )
      const posts = [first, ...rest.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))]
        .flatMap(pg => pg.jobPostings ?? [])
      return posts.map(j => {
        const location = workdayLocation(j.locationsText)
        return {
          id: j.externalPath, title: j.title, location,
          url: `https://${b.host}/en-US/${b.site}${j.externalPath}`,
          date: workdayPosted(j.postedOn),
          workplace: inferWorkplace(location, j.title),
        }
      })
    }
    case 'breezy': {
      const d = await getJson(`https://${b.slug}.breezy.hr/json`) as {
        id: string; name: string; url: string; published_date?: string
        location?: { name?: string; city?: string; country?: { name?: string }; is_remote?: boolean }
      }[]
      return (Array.isArray(d) ? d : []).map(j => ({
        id: j.id, title: j.name, url: j.url, date: isoDate(j.published_date),
        location: j.location?.name ?? joinLoc(j.location?.city, j.location?.country?.name),
        workplace: j.location?.is_remote ? 'remote' : inferWorkplace(j.name) === 'hybrid' ? 'hybrid' : 'onsite',
      }))
    }
  }
}

async function fromCompanies(query: string): Promise<SourcedJob[]> {
  const settled = await Promise.allSettled(COMPANY_BOARDS.map(readBoard))
  // A source is down only when every board failed; one rate-limited board
  // should not hide the other sixteen.
  if (settled.every(r => r.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult).reason
  }

  const jobs: SourcedJob[] = []
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const b = COMPANY_BOARDS[i]
    for (const p of r.value) {
      if (!looselyMatches(query, p.title)) continue
      const el = classifyEligibility(p.location)
      jobs.push({
        id: `companies:${b.ats}:${b.slug}:${p.id}`,
        title: p.title.trim(),
        company: b.name,
        companyUrl: null,
        location: p.location || null,
        date: p.date,
        url: p.url,
        source: 'companies',
        description: summarise(p.description),
        eligibility: el.level,
        eligibilityNote: el.note,
        workplace: p.workplace,
        remote: p.workplace === 'remote',
        visa: detectVisaSignal(`${p.title} ${p.description ?? ''}`),
      })
    }
  })
  return jobs
}

// ── Aggregate ─────────────────────────────────────────────────────
const ADAPTERS: Record<Exclude<JobSourceId, 'linkedin'>, (q: string) => Promise<SourcedJob[]>> = {
  remotive: fromRemotive,
  jobicy: fromJobicy,
  remoteok: fromRemoteOk,
  arbeitnow: fromArbeitnow,
  himalayas: fromHimalayas,
  workingnomads: fromWorkingNomads,
  weworkremotely: fromWeWorkRemotely,
  hotnigerianjobs: fromHotNigerianJobs,
  jobzilla: fromJobzilla,
  companies: fromCompanies,
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

// ── Relevance ─────────────────────────────────────────────────────

// Words that describe an employment arrangement rather than the work. A
// posting matching only on these is not a match: "full" would otherwise carry
// every "Full-time Gardener" into a search for "full stack developer".
const GENERIC_TERMS = new Set([
  'job', 'jobs', 'role', 'roles', 'position', 'positions', 'vacancy', 'hiring',
  'remote', 'onsite', 'on-site', 'hybrid', 'work', 'working',
  'full', 'part', 'time', 'contract', 'permanent', 'freelance', 'temporary',
  'senior', 'junior', 'mid', 'level', 'lead', 'staff', 'principal', 'experienced',
  'and', 'the', 'for', 'with', 'your', 'our',
  'nigeria', 'lagos', 'abuja', 'africa',
  // "software engineer" is a request for engineering work in general, not for
  // postings that happen to contain the word "software".
  'software',
])

/** What the canonical role noun collapses to; see ROLE_SYNONYMS. */
const ROLE_NOUN = 'developer'

// Boards spell the same role every possible way. Collapsing both the query and
// the posting to one spelling is what makes "fullstack developer" find a job
// titled "Full Stack Engineer" — previously it matched neither token.
const ROLE_SYNONYMS: Record<string, string> = {
  engineer: 'developer', engineering: 'developer', programmer: 'developer',
  dev: 'developer', developer: 'developer', developers: 'developer', engineers: 'developer',
  // Plurals of the level words, so "graduate trainees" finds "Graduate Trainee".
  graduates: 'graduate', trainees: 'trainee', interns: 'intern', internship: 'intern', internships: 'intern',
  apprentices: 'apprentice', apprenticeship: 'apprentice', apprenticeships: 'apprentice',
}

/** Career-stage words. A search containing one must match one, on top of
 *  the discipline: "electrical graduate trainee" is a trainee role in
 *  electrical work, not any trainee role and not any electrical role. */
const LEVEL_TERMS = new Set([
  'graduate', 'trainee', 'intern', 'internship', 'entry', 'apprentice', 'apprenticeship',
  'nysc', 'siwes', 'fresher',
])

/** Nouns too broad to match on by themselves: "developer" (every software
 *  job) and "engr" (every non-software engineer; see canonicalise). */
const WEAK_NOUNS = new Set(['developer', 'engr'])

/** Industry words a posting rarely uses verbatim: "oil and gas" roles are
 *  titled "Drilling Supervisor" at "Propetrol". A search term on the left
 *  matches any word on the right. */
const INDUSTRY_ALIASES: Record<string, string[]> = (() => {
  // Kept to words that only mean oil and gas. "energy" (Octopus Energy's
  // data analysts), "onshore" (crypto "onshore markets") and "hse" (every
  // safety role) let unrelated work through.
  const oilGas = ['oil', 'gas', 'petroleum', 'upstream', 'downstream', 'midstream', 'offshore',
    'drilling', 'refinery', 'refining', 'lng', 'pipeline', 'pipelines', 'exploration', 'subsea', 'rig', 'reservoir',
    'wellsite', 'completions', 'petrochemical']
  const power = ['power', 'energy', 'electrical', 'electricity', 'substation', 'transmission', 'generation', 'solar', 'utilities', 'grid']
  const telecom = ['telecom', 'telecoms', 'telecommunication', 'telecommunications', 'rf', 'network', 'tower', 'fibre', 'fiber']
  return {
    oil: oilGas, gas: oilGas, petroleum: oilGas, upstream: oilGas, downstream: oilGas,
    energy: [...power, 'oil', 'gas', 'renewable', 'renewables'],
    power, electricity: power,
    renewable: ['renewable', 'renewables', 'solar', 'wind', 'energy'], renewables: ['renewable', 'renewables', 'solar', 'wind', 'energy'],
    telecom, telecoms: telecom, telecommunication: telecom, telecommunications: telecom,
    mining: ['mining', 'mine', 'minerals', 'quarry', 'geologist', 'geology'],
    construction: ['construction', 'civil', 'building', 'site', 'structural', 'quantity'],
  }
})()

/** What one search term accepts in a posting. */
function expandTerm(t: string): string[] {
  return INDUSTRY_ALIASES[t] ?? [t]
}

/** Collapses spelling variants so both sides of a comparison agree. */
function canonicalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    // ReactJS, React.js and "react js" all name the same technology.
    // Without this, a search for "react" misses a posting titled
    // "ReactJS Developer": no word boundary falls between react and js.
    .replace(/\b(react|node|vue|next|angular|express|nest|ember)[\s.]?js\b/g, '$1')
    .replace(/\bfull\s+stack\b/g, 'fullstack')
    .replace(/\bfront\s+end\b/g, 'frontend')
    .replace(/\bback\s+end\b/g, 'backend')
    .replace(/\bdev\s+ops\b/g, 'devops')
    // A civil or electrical engineer is not a developer. Without this, a
    // search for "software engineer" (which reduces to the role noun) fills
    // the Nigeria results with site and power engineers from the local boards.
    .replace(/\b(civil|electrical|mechanical|site|structural|chemical|petroleum|process|field|maintenance|sales|biomedical|production|hse|mining|marine|agricultural|instrumentation|building|geotechnical|reservoir|drilling|automation|electronics|power|plant|facility|facilities|water|environmental|quantity)\s+engineer(ing)?\b/g, '$1 engr')
    .replace(/\b(curriculum|content|business|property|real estate|land|instructional|course|talent|training|community|brand|market|sales)\s+developers?\b/g, '$1 devr')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => ROLE_SYNONYMS[w] ?? w)
    .join(' ')
}

/** The query words that actually discriminate between postings. Two-letter
 *  technologies (Go, C#, AI, ML, QA) are kept; other short words are noise. */
const SHORT_TERMS = new Set(['go', 'c#', 'c++', 'ai', 'ml', 'qa', 'ui', 'ux', 'r', 'js', 'ts'])
export function meaningfulTerms(query: string): string[] {
  return Array.from(
    new Set(
      canonicalise(query)
        .split(' ')
        .filter(t => (t.length >= 3 || SHORT_TERMS.has(t)) && !GENERIC_TERMS.has(t)),
    ),
  )
}

/** A title that names software work, read from the original wording. */
const SOFTWARE_TITLE = /\b(developer|programmer|software|front[- ]?end|back[- ]?end|full[- ]?stack|devops|devsecops|sre|site reliability|mobile|ios|android|web|cloud|platform|machine learning|ml|ai|llm|qa|sdet|test automation|security engineer|infrastructure|data engineer|react|node|python|java|golang|rust|php|ruby|\.net|engineering manager|head of engineering|cto|blockchain|smart contract|firmware|embedded)\b/i

const NON_SOFTWARE_TITLE = /\b(curriculum|content|business|property|real estate|land|instructional|course|talent|training|community|brand|market|sales)\s+developer/i

/**
 * Re-filters results against the query — every source matches loosely.
 *
 * Remotive searches descriptions, so "fullstack developer" returns copywriters;
 * Jobicy falls back to its whole feed when a tag does not resolve; LinkedIn
 * pads a thin result set with whatever it considers adjacent. This is the one
 * place that decides a posting is actually the work that was asked for.
 */
export function filterRelevant(jobs: SourcedJob[], query: string): SourcedJob[] {
  const terms = meaningfulTerms(query)
  // A query of nothing but generic words cannot discriminate; the API
  // rejects those, so this only guards direct callers.
  if (!terms.length) return jobs

  // Three kinds of term, matched differently:
  //   level    — graduate, trainee, intern…: one must match
  //   subject  — the discipline or speciality (react, electrical, oil…):
  //              one must match, through industry aliases
  //   weak     — the bare role noun: far too broad on its own ("fullstack
  //              developer" would return service-desk roles), so it only
  //              decides anything when nothing else was asked for
  const level = terms.filter(t => LEVEL_TERMS.has(t))
  const subject = terms.filter(t => !LEVEL_TERMS.has(t) && !WEAK_NOUNS.has(t))
  const nounOnly = !subject.length && terms.some(t => WEAK_NOUNS.has(t))
  // "software engineer", "developer": software work specifically. A plain
  // "engineer" or "graduate engineer" means any engineering discipline.
  const softwareIntent = /\b(software|developer|developers|programmer|dev|coder)\b/i.test(query)

  const word = (t: string) => new RegExp(`(?<![a-z0-9+#])${t.replace(/[+#]/g, '\\$&')}(?![a-z0-9+#])`)

  return jobs.filter(j => {
    const title = j.title ?? ''
    const keywords = (j.keywords ?? []).join(' ')
    // Whole words only: substring matching lets "art" match "start". The
    // lookarounds stand in for \b, which never matches after "#" or "+".
    const hay = canonicalise(`${title} ${j.company ?? ''} ${keywords}`)

    if (subject.length && !subject.some(t => expandTerm(t).some(a => word(a).test(hay)))) return false
    if (level.length && !level.some(t => word(t).test(hay))) return false

    if (nounOnly) {
      if (softwareIntent) {
        // "engineer" alone would admit HVAC and service engineers, and a
        // company called "X Engineering" would admit its CFO.
        return SOFTWARE_TITLE.test(title) && !NON_SOFTWARE_TITLE.test(title)
      }
      return /\b(engineer\w*|technician|technologist)\b/i.test(`${title} ${keywords}`)
    }
    return true
  })
}

// ── Filters ───────────────────────────────────────────────────────

export interface JobFilters {
  mode: SearchMode
  /** Days; 0 means any age. */
  jobage: number
  workplace?: Workplace
  location?: string
  africaOnly: boolean
  sponsorOnly: boolean
}

/** Location words that mean "work from anywhere" rather than a place. */
const ANYWHERE_LOCATION = /^(remote|anywhere|worldwide|global)$/i
const AFRICA_LOCATION = /^(africa|west africa|emea)$/i

function matchesLocation(j: SourcedJob, wanted: string): boolean {
  if (ANYWHERE_LOCATION.test(wanted)) return j.workplace === 'remote'
  // A remote job open to Nigeria can be done from any Nigerian city.
  if ((NIGERIA.test(wanted) || AFRICA_LOCATION.test(wanted)) && j.workplace === 'remote' && j.eligibility === 'africa-ok') {
    return true
  }
  if (AFRICA_LOCATION.test(wanted)) return j.eligibility === 'africa-ok'
  const hay = `${j.location ?? ''} ${j.eligibilityNote ?? ''}`.toLowerCase()
  // Every word of "Port Harcourt" must appear, but in any order or field.
  return wanted.toLowerCase().split(/[\s,]+/).filter(Boolean).every(w => hay.includes(w))
}

/** Whether a job belongs in the mode at all, whichever source produced it. */
function fitsMode(j: SourcedJob, mode: SearchMode): boolean {
  switch (mode) {
    case 'remote':     return j.workplace === 'remote'
    case 'nigeria':    return isInNigeria(j.location) || (j.workplace === 'remote' && j.eligibility === 'africa-ok')
    case 'relocation': return j.workplace !== 'remote' && !isInNigeria(j.location)
  }
}

/**
 * Applies every user filter to every source alike. Sources each honour a
 * different subset of these upstream (LinkedIn takes a date and location,
 * the boards take neither), so the API cannot rely on them.
 */
export function applyFilters(jobs: SourcedJob[], f: JobFilters): SourcedJob[] {
  const cutoff = f.jobage > 0
    ? new Date(Date.now() - f.jobage * 86400000).toISOString().slice(0, 10)
    : null

  return jobs.filter(j => {
    if (!fitsMode(j, f.mode)) return false
    // An undated posting cannot be shown to be recent, so a date filter
    // excludes it rather than letting it through.
    if (cutoff && (!j.date || j.date < cutoff)) return false
    if (f.workplace && j.workplace !== f.workplace) return false
    if (f.location && !matchesLocation(j, f.location)) return false
    if (f.africaOnly && j.eligibility !== 'africa-ok') return false
    // A posting that says it will not sponsor is useless when relocating,
    // whatever the register says about the company.
    if (f.mode === 'relocation' && j.visa === 'denies') return false
    if (f.sponsorOnly && !(j.ukSponsor || j.visa === 'offers')) return false
    return true
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
