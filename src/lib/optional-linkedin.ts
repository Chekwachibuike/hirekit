// Loads an optional job-source adapter from private/ if one is installed.
// Runtime require, not import — a static specifier would fail the build when
// the file is absent, which is the normal case.
import path from 'path'
import type { JobCard, JobDetail, JobSearchOptions } from './job-sources'

export interface LinkedInAdapter {
  searchJobs(opts: JobSearchOptions): Promise<JobCard[]>
  getJobDetail(id: string): Promise<JobDetail | null>
}

let cached: LinkedInAdapter | null | undefined
let lastError: string | null = null

/** The adapter, or null when not installed. */
export function loadLinkedIn(): LinkedInAdapter | null {
  if (cached !== undefined) return cached

  const file = path.join(process.cwd(), 'private', 'linkedin.cjs')
  try {
    // eval('require') is opaque to the bundler, which leaves it alone.
    // createRequire gets rewritten during bundling and the rewritten form
    // did not resolve, so the adapter read as missing when it was present.
    // eslint-disable-next-line no-eval
    const nodeRequire = eval('require') as NodeRequire
    const mod = nodeRequire(file) as LinkedInAdapter
    cached = typeof mod?.searchJobs === 'function' ? mod : null
    lastError = cached ? null : `loaded ${file} but it has no searchJobs export`
  } catch (err) {
    cached = null
    lastError = `${file}: ${err instanceof Error ? err.message : String(err)}`
  }
  return cached
}

export function isLinkedInAvailable(): boolean {
  return loadLinkedIn() !== null
}

/** Why the adapter is unavailable — null when it loaded. */
export function linkedInLoadError(): string | null {
  loadLinkedIn()
  return lastError
}
