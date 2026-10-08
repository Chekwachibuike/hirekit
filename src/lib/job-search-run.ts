// The job search itself: every source, relevance, the user's filters, the
// UK sponsor register (relocation) and the scam check. Shared by the search
// API and the job-alert checker, so an alert sees exactly what a search
// would. Server-only.

import { loadLinkedIn, linkedInLoadError } from './optional-linkedin'
import {
  searchRemoteBoards, filterRelevant, applyFilters, dedupe, classifyEligibility, inferWorkplace,
  type SourcedJob, type SourceOutcome,
} from './job-sources'
import type { SearchParams } from './job-search-params'
import { assessJobs, type RiskAssessment } from './scam-check'
import { checkSponsorsBulk } from './uk-sponsors'

export interface JobSearchResult {
  data: (SourcedJob & { risk: RiskAssessment })[]
  sources: SourceOutcome[]
  mode: SearchParams['mode']
  eligibleCount: number
  sponsorCount: number
  visaCount: number
  sponsorAsOf: string | null
  suspiciousCount: number
}

export async function runJobSearch(p: SearchParams): Promise<JobSearchResult> {
  // LinkedIn paginates; the boards return one flat batch, so they are only
  // queried for page 1 and "load more" continues through LinkedIn alone.
  const wantBoards = p.page === 1 && p.sources.some(s => s !== 'linkedin')
  // Absent in a public clone, where the board APIs carry the search.
  const linkedIn = loadLinkedIn()
  const wantLinkedIn = p.sources.includes('linkedin') && linkedIn !== null

  // LinkedIn takes the filters natively, which keeps its pages full of
  // matches; applyFilters below still re-checks everything it returns.
  const liWorkplace = p.mode === 'remote' ? 'remote' : p.workplace
  const liLocation = p.location ?? (p.mode === 'nigeria' ? 'Nigeria' : undefined)

  const [liRes, boardRes] = await Promise.allSettled([
    wantLinkedIn && linkedIn
      ? linkedIn.searchJobs({
          query: p.query,
          location: liLocation,
          jobage: p.jobage || undefined,
          remote: liWorkplace,
          page: p.page,
        })
      : Promise.resolve([]),
    wantBoards ? searchRemoteBoards(p.query, p.sources) : Promise.resolve({ jobs: [], outcomes: [] }),
  ])

  const outcomes: SourceOutcome[] = []

  // The adapter is required from disk at runtime. When it is missing the
  // search dropped LinkedIn without pushing any outcome, so the source just
  // vanished from the UI with nothing saying why.
  if (p.sources.includes('linkedin') && !linkedIn) {
    outcomes.push({
      source: 'linkedin', ok: false, count: 0,
      error: linkedInLoadError() ?? 'LinkedIn adapter not installed',
    })
  }

  const bySource = new Map<string, SourcedJob[]>()

  if (liRes.status === 'fulfilled') {
    // LinkedIn publishes a job's own location, not who may apply — those are
    // different questions, so eligibility stays 'unknown' unless the location
    // itself is in Nigeria or open to Africa.
    const li: SourcedJob[] = liRes.value.map(j => {
      const el = classifyEligibility(j.location)
      // Asked-for workplace when LinkedIn was told one; otherwise read it
      // from the card, which says "(Remote)" / "(Hybrid)" when it applies.
      const workplace = liWorkplace ?? inferWorkplace(j.location, j.title)
      return {
        ...j,
        source: 'linkedin' as const,
        eligibility: el.level === 'africa-ok' ? 'africa-ok' : 'unknown',
        eligibilityNote: j.location,
        workplace,
        remote: workplace === 'remote',
      }
    })
    bySource.set('linkedin', filterRelevant(li, p.query))
  } else if (wantLinkedIn) {
    outcomes.push({
      source: 'linkedin', ok: false, count: 0,
      error: liRes.reason instanceof Error ? liRes.reason.message : String(liRes.reason),
    })
  }

  if (boardRes.status === 'fulfilled') {
    for (const j of filterRelevant(boardRes.value.jobs, p.query)) {
      const list = bySource.get(j.source) ?? []
      list.push(j)
      bySource.set(j.source, list)
    }
  }

  let jobs = dedupe(Array.from(bySource.values()).flat())

  // Relocation mode only: a sponsor licence is about moving country, and
  // the register is 11MB, so it is never fetched for other searches.
  let sponsorAsOf: string | null = null
  if (p.mode === 'relocation') {
    const { map, asOf } = await checkSponsorsBulk(jobs.map(j => j.company))
    sponsorAsOf = asOf
    jobs = jobs.map(j => {
      const m = j.company ? map.get(j.company) : undefined
      return m?.licensed
        ? { ...j, ukSponsor: true, ukSponsorMatchedAs: m.matchedAs }
        : { ...j, ukSponsor: false }
    })
  }

  // Counted before the africa/sponsor toggles so the UI can say how many
  // the toggle would keep, but after the hard filters (mode, date,
  // workplace, location), which the user did choose.
  const base = applyFilters(jobs, {
    mode: p.mode, jobage: p.jobage, workplace: p.workplace, location: p.location,
    africaOnly: false, sponsorOnly: false,
  })
  const eligibleCount = base.filter(j => j.eligibility === 'africa-ok').length
  const sponsorCount = base.filter(j => j.ukSponsor).length
  const visaCount = base.filter(j => j.visa === 'offers').length

  const filtered = applyFilters(base, {
    mode: p.mode, jobage: 0, africaOnly: p.africaOnly, sponsorOnly: p.sponsorOnly,
  })

  const assessed = await assessJobs(filtered)
  const suspiciousCount = assessed.filter(j => j.risk.level === 'suspicious').length
  const shown = p.showRisky ? assessed : assessed.filter(j => j.risk.level !== 'suspicious')

  // Per-source counts reflect what is actually shown, so "Himalayas 12"
  // means twelve rows on screen, not twelve fetched and then filtered.
  const shownBySource = new Map<string, number>()
  for (const j of shown) shownBySource.set(j.source, (shownBySource.get(j.source) ?? 0) + 1)
  if (liRes.status === 'fulfilled' && wantLinkedIn) {
    outcomes.push({ source: 'linkedin', ok: true, count: shownBySource.get('linkedin') ?? 0 })
  }
  if (boardRes.status === 'fulfilled') {
    for (const o of boardRes.value.outcomes) {
      outcomes.push(o.ok ? { ...o, count: shownBySource.get(o.source) ?? 0 } : o)
    }
  }

  // Newest first, undated last.
  shown.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  return {
    data: shown, sources: outcomes, mode: p.mode,
    eligibleCount, sponsorCount, visaCount, sponsorAsOf, suspiciousCount,
  }
}
