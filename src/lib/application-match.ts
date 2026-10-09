// Recognises a job that is already on the user's Applications board, so Job
// Search says "Applied" instead of offering to track it again — whether it
// was tracked from search, added by hand, or tracked in another session.
//
// Two keys, strongest first:
//   - the posting's link, normalised (LinkedIn by job id, since its URLs
//     carry tracking parameters and several path shapes)
//   - company + role, normalised, for applications added by hand without
//     a link, or found again on a different board
//
// Client-safe: no server imports.

import type { AppStatus } from './supabase'

export interface TrackedApplication {
  id: string
  company: string
  role: string
  status: AppStatus
  job_url?: string | null
}

export const STATUS_LABELS: Record<AppStatus, string> = {
  draft: 'Saved',
  applied: 'Applied',
  interview: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'No response',
}

export function urlKey(raw?: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host.endsWith('linkedin.com')) {
      const id = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/)?.[1] ?? u.searchParams.get('currentJobId')
      if (id) return `linkedin:${id}`
    }
    return `${host}${u.pathname.replace(/\/+$/, '').toLowerCase()}`
  } catch {
    return null
  }
}

/** Legal and filler words that vary between boards for the same employer:
 *  "Moniepoint Inc.", "Moniepoint Incorporated", "Moniepoint Nigeria". */
const COMPANY_NOISE = /\b(limited|ltd|plc|inc|incorporated|llc|llp|gmbh|nigeria|ng|group|holdings|company|co|corp|corporation|the)\b/g

function words(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function companyKey(s?: string | null): string {
  return words(s ?? '').replace(COMPANY_NOISE, ' ').replace(/\s+/g, ' ').trim()
}

export function roleKey(s?: string | null): string {
  // Bracketed asides ("(Remote)", "(Lagos)") differ between boards.
  return words((s ?? '').replace(/\([^)]*\)/g, ' '))
}

export interface TrackedIndex {
  find(job: { url?: string | null; company?: string | null; title?: string | null }): TrackedApplication | undefined
}

export function buildTrackedIndex(apps: TrackedApplication[]): TrackedIndex {
  const byUrl = new Map<string, TrackedApplication>()
  const byPair = new Map<string, TrackedApplication>()
  for (const a of apps) {
    const k = urlKey(a.job_url)
    if (k && !byUrl.has(k)) byUrl.set(k, a)
    const c = companyKey(a.company), r = roleKey(a.role)
    if (c && r && !byPair.has(`${c}|${r}`)) byPair.set(`${c}|${r}`, a)
  }
  return {
    find(job) {
      const k = urlKey(job.url)
      if (k && byUrl.has(k)) return byUrl.get(k)
      const c = companyKey(job.company), r = roleKey(job.title)
      // Both halves required: "Software Engineer" alone matches half the board.
      return c && r ? byPair.get(`${c}|${r}`) : undefined
    },
  }
}
