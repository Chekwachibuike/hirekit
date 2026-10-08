// Validates /api/job-search query parameters. Anything malformed is rejected
// with a message the UI can show as-is, rather than silently ignored: a typo'd
// filter that quietly does nothing reads as "no jobs exist".
//
// Shared by the API route and the search page, so both enforce the same rules.

import {
  ALL_SOURCES, SOURCES_BY_MODE, meaningfulTerms,
  type JobSourceId, type SearchMode, type Workplace,
} from './job-sources'

export const QUERY_MIN = 2
export const QUERY_MAX = 100
export const LOCATION_MAX = 80
export const MAX_PAGE = 20
export const MAX_JOBAGE_DAYS = 365

export interface SearchParams {
  query: string
  location?: string
  workplace?: Workplace
  jobage: number
  page: number
  mode: SearchMode
  sources: JobSourceId[]
  africaOnly: boolean
  sponsorOnly: boolean
  /** Include postings the scam check marks suspicious. */
  showRisky: boolean
}

// error is present on both arms so callers can read it without narrowing;
// tsconfig is not strict, and discriminant narrowing needs strictNullChecks.
export type Parsed<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: string; value?: undefined }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

const MODES: SearchMode[] = ['remote', 'nigeria', 'relocation']
const WORKPLACES: Workplace[] = ['remote', 'hybrid', 'onsite']

/** Collapses whitespace and drops control characters and markup brackets. */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Checks the keywords alone; the page uses this before sending anything. */
export function validateQuery(raw: string): Parsed<string> {
  const q = cleanText(raw)
  if (!q) return { ok: false, error: 'Enter what you are looking for, e.g. "React developer".' }
  if (q.length < QUERY_MIN) return { ok: false, error: `Keywords must be at least ${QUERY_MIN} characters.` }
  if (q.length > QUERY_MAX) return { ok: false, error: `Keywords must be ${QUERY_MAX} characters or fewer.` }
  if (!/[a-z0-9]/i.test(q)) return { ok: false, error: 'Keywords must contain letters or numbers.' }
  // Words like "remote job" or "senior" describe the arrangement, not the
  // work, so they cannot filter anything: every posting would match.
  if (!meaningfulTerms(q).length) {
    return {
      ok: false,
      error: `"${q}" is too general to filter on. Add a skill or role, e.g. "React", "backend developer" or "data analyst".`,
    }
  }
  return { ok: true, value: q }
}

export function validateLocation(raw: string): Parsed<string | undefined> {
  const loc = cleanText(raw)
  if (!loc) return { ok: true, value: undefined }
  if (loc.length > LOCATION_MAX) return { ok: false, error: `Location must be ${LOCATION_MAX} characters or fewer.` }
  // Place names: Latin letters incl. accented, spaces, and the punctuation that
  // appears in them ("Port Harcourt", "St. John's", "Ile-Ife", "Lagos, NG").
  if (!/^[A-Za-zÀ-ɏ0-9 .,'()-]+$/.test(loc)) {
    return { ok: false, error: 'Location can only contain letters, numbers, spaces and , . \' - ( )' }
  }
  return { ok: true, value: loc }
}

function parseBool(name: string, raw: string | null): Parsed<boolean> {
  if (raw === null || raw === '' || raw === '0' || raw === 'false') return { ok: true, value: false }
  if (raw === '1' || raw === 'true') return { ok: true, value: true }
  return { ok: false, error: `${name} must be 1 or 0.` }
}

function parseInt10(name: string, raw: string | null, min: number, max: number, fallback: number): Parsed<number> {
  if (raw === null || raw === '') return { ok: true, value: fallback }
  if (!/^\d+$/.test(raw)) return { ok: false, error: `${name} must be a whole number.` }
  const n = Number(raw)
  if (n < min || n > max) return { ok: false, error: `${name} must be between ${min} and ${max}.` }
  return { ok: true, value: n }
}

export function parseSearchParams(params: URLSearchParams): Parsed<SearchParams> {
  const q = validateQuery(params.get('q') ?? '')
  if (!q.ok) return fail(q.error!)

  const loc = validateLocation(params.get('location') ?? '')
  if (!loc.ok) return fail(loc.error!)

  const modeRaw = params.get('mode') ?? 'remote'
  if (!MODES.includes(modeRaw as SearchMode)) {
    return { ok: false, error: `mode must be one of: ${MODES.join(', ')}.` }
  }
  const mode = modeRaw as SearchMode

  const wpRaw = params.get('remote') ?? ''
  if (wpRaw && !WORKPLACES.includes(wpRaw as Workplace)) {
    return { ok: false, error: `remote must be one of: ${WORKPLACES.join(', ')}.` }
  }
  let workplace = (wpRaw || undefined) as Workplace | undefined
  // Remote mode is remote work by definition; a contradicting workplace
  // would filter out every result, so it is an error rather than a no-op.
  if (mode === 'remote' && workplace && workplace !== 'remote') {
    return { ok: false, error: 'Remote mode only has remote jobs — switch to "In Nigeria" or "Relocation" for on-site or hybrid.' }
  }
  if (mode === 'relocation' && workplace === 'remote') {
    return { ok: false, error: 'Relocation mode is for on-site and hybrid roles abroad — use Remote mode for remote work.' }
  }
  if (mode === 'remote') workplace = undefined

  const jobage = parseInt10('jobage', params.get('jobage'), 0, MAX_JOBAGE_DAYS, 0)
  if (!jobage.ok) return fail(jobage.error!)
  const page = parseInt10('page', params.get('page'), 1, MAX_PAGE, 1)
  if (!page.ok) return fail(page.error!)

  const africaOnly = parseBool('africaOnly', params.get('africaOnly'))
  if (!africaOnly.ok) return fail(africaOnly.error!)
  const sponsorOnly = parseBool('sponsorOnly', params.get('sponsorOnly'))
  if (!sponsorOnly.ok) return fail(sponsorOnly.error!)
  const showRisky = parseBool('showRisky', params.get('showRisky'))
  if (!showRisky.ok) return fail(showRisky.error!)

  const sourcesRaw = params.get('sources')
  let sources = SOURCES_BY_MODE[mode]
  if (sourcesRaw !== null && sourcesRaw.trim() !== '') {
    const asked = Array.from(new Set(sourcesRaw.split(',').map(s => s.trim()).filter(Boolean)))
    const unknown = asked.filter(s => !ALL_SOURCES.includes(s as JobSourceId))
    if (unknown.length) {
      return { ok: false, error: `Unknown source${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Valid: ${ALL_SOURCES.join(', ')}.` }
    }
    sources = asked as JobSourceId[]
  }

  return {
    ok: true,
    value: {
      query: q.value,
      location: loc.value,
      workplace,
      jobage: jobage.value,
      page: page.value,
      mode,
      sources,
      // Africa-only is about who may apply to remote work; in the other
      // modes the location is the job's own, so it does not apply.
      africaOnly: mode === 'remote' && africaOnly.value,
      sponsorOnly: mode === 'relocation' && sponsorOnly.value,
      showRisky: showRisky.value,
    },
  }
}

/** LinkedIn job ids are numeric. */
export function validateJobId(raw: string): Parsed<string> {
  const id = raw.trim()
  return /^\d{6,20}$/.test(id) ? { ok: true, value: id } : { ok: false, error: 'Invalid job id.' }
}
