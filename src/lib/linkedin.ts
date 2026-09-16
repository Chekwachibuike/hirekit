// LinkedIn job search via the public "jobs-guest" endpoints — no login, no API
// key, no npm packages. Search returns an HTML list of job cards; detail
// returns a single job's HTML. Both are parsed with regex (the markup is
// shallow and stable, so a DOM parser would be overkill).
//
// Server-side only — call from API routes, never from Client Components
// (the browser would hit CORS; the server won't).
//
// Adapted from github.com/MadsLorentzen/ai-job-search (MIT).

const SEARCH_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search'
const DETAIL_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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

export interface SearchOptions {
  query?: string
  location?: string
  /** Only show jobs posted within this many days */
  jobage?: number
  remote?: 'remote' | 'hybrid' | 'onsite'
  page?: number
}

// ── Fetch with backoff ────────────────────────────────────────────
// LinkedIn rate-limits aggressively (429). Retry with exponential backoff
// + jitter so a burst of searches doesn't permanently fail.
async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 4
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`LinkedIn rate limit — try again in a minute (${response.status})`)
      }
      const jitter = Math.floor(Math.random() * 400)
      await new Promise(r => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 6000)
      continue
    }
    if (response.status === 404) return ''
    if (!response.ok) throw new Error(`LinkedIn request failed: ${response.status}`)
    return response.text()
  }
  throw new Error('LinkedIn request failed after retries')
}

// ── HTML → text helpers ───────────────────────────────────────────
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

// ── Search ────────────────────────────────────────────────────────
function buildSearchUrl(opts: SearchOptions): string {
  const params = new URLSearchParams()
  if (opts.query) params.set('keywords', opts.query)
  if (opts.location) params.set('location', opts.location)
  if (opts.jobage && opts.jobage > 0) params.set('f_TPR', `r${opts.jobage * 86400}`)
  const wt = { onsite: '1', remote: '2', hybrid: '3' }[opts.remote ?? ''] ?? null
  if (wt) params.set('f_WT', wt)
  params.set('start', String(((opts.page ?? 1) - 1) * 10))
  return `${SEARCH_URL}?${params.toString()}`
}

// The response is a flat list of <li> job cards. Split on the job-posting URN
// and parse each chunk independently so one malformed card can't break the rest.
function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/data-entity-urn="urn:li:jobPosting:/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const linkMatch = chunk.match(/class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/i)
    const url = linkMatch ? decodeHtmlEntities(linkMatch[1]).split('?')[0] : ''

    let title: string | null = null
    const h3 = chunk.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i)
    if (h3) title = clean(h3[1])
    if (!title) {
      const sr = chunk.match(/class="sr-only"[^>]*>([\s\S]*?)<\/span>/i)
      if (sr) title = clean(sr[1])
    }
    if (!title) continue

    let company: string | null = null
    let companyUrl: string | null = null
    const sub = chunk.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i)
    if (sub) {
      const a = sub[1].match(/href="([^"]+)"/i)
      if (a) companyUrl = decodeHtmlEntities(a[1]).split('?')[0]
      company = clean(sub[1]) || null
    }

    const loc = chunk.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i)
    const location = loc ? clean(loc[1]) || null : null
    const dt = chunk.match(/class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/i)
    const date = dt ? dt[1] : null

    results.push({
      id, title, company, companyUrl, location, date,
      url: url || `https://www.linkedin.com/jobs/view/${id}`,
    })
  }

  return results
}

export async function searchJobs(opts: SearchOptions): Promise<JobCard[]> {
  const html = await htmlFetch(buildSearchUrl(opts))
  return parseJobCards(html)
}

// ── Detail ────────────────────────────────────────────────────────
export async function getJobDetail(id: string): Promise<JobDetail | null> {
  const html = await htmlFetch(`${DETAIL_URL}/${id}`)
  if (!html) return null

  const title = html.match(
    /class="(?:top-card-layout__title|topcard__title)[^"]*"[^>]*>([\s\S]*?)<\/h[12]>/i,
  )?.[1]
  const orgMatch = html.match(
    /class="topcard__org-name-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  )
  const company = orgMatch ? clean(orgMatch[2]) || null : null
  const companyUrl = orgMatch ? decodeHtmlEntities(orgMatch[1]).split('?')[0] : null

  const locMatch = html.match(
    /class="topcard__flavor topcard__flavor--bullet"[^>]*>([\s\S]*?)<\/span>/i,
  )
  const location = locMatch ? clean(locMatch[1]) || null : null

  // Rich description block — keep paragraph/list breaks as newlines
  let description: string | null = null
  const desc = html.match(
    /class="(?:show-more-less-html__markup|description__text[^"]*)"[^>]*>([\s\S]*?)<\/div>/i,
  )
  if (desc) {
    const withBreaks = desc[1]
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, '\n')
    description = decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, '\n\n').trim() || null
  }

  // Job-criteria items: subheader label → text value
  const criteria: Record<string, string> = {}
  const itemRe =
    /class="description__job-criteria-subheader"[^>]*>([\s\S]*?)<\/h3>[\s\S]*?class="description__job-criteria-text[^"]*"[^>]*>([\s\S]*?)<\/span>/gi
  let cm: RegExpExecArray | null
  while ((cm = itemRe.exec(html)) !== null) {
    criteria[clean(cm[1]).toLowerCase()] = clean(cm[2])
  }

  const applyMatch = html.match(/class="topcard__link[^"]*"[^>]*href="([^"]+)"/i)
  const applyUrl = applyMatch ? decodeHtmlEntities(applyMatch[1]).split('?')[0] : null

  return {
    id,
    title: title ? clean(title) : '(untitled)',
    company, companyUrl, location,
    date: null,
    url: `https://www.linkedin.com/jobs/view/${id}`,
    description,
    seniority: criteria['seniority level'] ?? null,
    employmentType: criteria['employment type'] ?? null,
    jobFunction: criteria['job function'] ?? null,
    industries: criteria['industries'] ?? null,
    applyUrl,
  }
}
