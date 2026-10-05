// UK Home Office register of licensed visa sponsors.
//
// Published daily on gov.uk as a CSV of every organisation licensed to sponsor
// a work visa — about 143,000 rows, of which ~123,000 hold the Skilled Worker
// route that matters for a job application. Only that route is kept; the rest
// cover ministers of religion, sportspeople and seasonal work.
//
// This answers "can this company legally sponsor me?" from an authoritative
// source, which is far better than hoping a job ad mentions it. It does NOT
// say they will sponsor for a given role — a licence is permission, not intent.
//
// Server-side only. Loaded lazily and cached, because it is ~11MB over the
// wire and nothing should pay for it unless relocation search is used.

const PUBLICATION =
  'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HireKit/1.0'
const TTL_MS = 24 * 60 * 60 * 1000   // the register is republished daily

interface Cache {
  names: Set<string>
  /** First token -> normalised entries starting with it, for trading names.
   *  Boards say "Monzo"; the register says "Monzo Bank Limited". */
  byFirstWord: Map<string, string[]>
  loadedAt: number
  csvDate: string | null
}
let cache: Cache | null = null
let inFlight: Promise<Cache | null> | null = null

/**
 * Collapses a company name to something comparable.
 *
 * Boards write "Monzo" where the register says "Monzo Bank Limited", so legal
 * suffixes and punctuation are stripped from both sides before matching.
 */
export function normaliseCompany(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(limited|ltd|plc|llp|llc|inc|incorporated|corporation|corp|company|co|group|holdings|uk|gb|international|technologies|technology)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The CSV filename carries the publication date, so the page is scraped. */
async function findCsvUrl(): Promise<string | null> {
  const res = await fetch(PUBLICATION, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) return null
  const html = await res.text()
  const m = html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/)
  return m ? m[0] : null
}

async function load(): Promise<Cache | null> {
  const url = await findCsvUrl()
  if (!url) return null

  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) return null
  const csv = await res.text()

  const names = new Set<string>()
  const byFirstWord = new Map<string, string[]>()
  const lines = csv.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    // Only the Skilled Worker route, and only the first column. Names in the
    // file carry a leading space, which normalisation removes anyway.
    if (!line.endsWith('Skilled Worker')) continue
    const comma = line.indexOf(',')
    if (comma < 1) continue
    const n = normaliseCompany(line.slice(0, comma))
    if (n.length <= 2) continue
    names.add(n)

    const space = n.indexOf(' ')
    if (space > 0) {
      const head = n.slice(0, space)
      const list = byFirstWord.get(head)
      if (list) { if (list.length < 40) list.push(n) }
      else byFirstWord.set(head, [n])
    }
  }

  const date = url.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  return { names, byFirstWord, loadedAt: Date.now(), csvDate: date }
}

/** Cached register, fetching it on first use. Null if gov.uk is unreachable. */
export async function getSponsorRegister(): Promise<Cache | null> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache
  // Concurrent searches must not each download 11MB.
  if (inFlight) return inFlight
  inFlight = load()
    .then(c => { if (c) cache = c; return c })
    .catch(() => null)
    .finally(() => { inFlight = null })
  return inFlight
}

export interface SponsorMatch {
  licensed: boolean
  /** Which register entry matched, so a wrong match is visible rather than
   *  silent. Shown in the badge tooltip. */
  matchedAs: string | null
  /** Exact on the name, or a prefix hit on a longer legal name. */
  via: 'exact' | 'prefix' | null
}

function lookup(reg: Cache, company: string): SponsorMatch {
  const n = normaliseCompany(company)
  if (!n) return { licensed: false, matchedAs: null, via: null }
  if (reg.names.has(n)) return { licensed: true, matchedAs: n, via: 'exact' }

  // A board's trading name is often the start of the registered legal name.
  // Requires 5+ characters: shorter queries match too many unrelated firms,
  // and a false positive here costs a wasted application.
  if (n.length >= 5 && !n.includes(' ')) {
    const candidates = reg.byFirstWord.get(n)
    if (candidates && candidates.length > 0) {
      return { licensed: true, matchedAs: candidates[0], via: 'prefix' }
    }
  }
  return { licensed: false, matchedAs: null, via: null }
}

/** One register load for a whole result set rather than one per row. */
export async function checkSponsorsBulk(
  companies: (string | null)[],
): Promise<{ map: Map<string, SponsorMatch>; asOf: string | null }> {
  const reg = await getSponsorRegister()
  const map = new Map<string, SponsorMatch>()
  if (!reg) return { map, asOf: null }
  for (const c of companies) {
    if (!c || map.has(c)) continue
    map.set(c, lookup(reg, c))
  }
  return { map, asOf: reg.csvDate }
}
