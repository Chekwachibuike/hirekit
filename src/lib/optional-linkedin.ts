// Loads the optional LinkedIn adapter from private/ (gitignored) if installed.
// Runtime require, not import — a static specifier would fail the build when
// the file is absent. See docs/internal/decisions.md.
import path from 'path'
import { createRequire } from 'module'
import type { JobCard, JobDetail, JobSearchOptions } from './job-sources'

export interface LinkedInAdapter {
  searchJobs(opts: JobSearchOptions): Promise<JobCard[]>
  getJobDetail(id: string): Promise<JobDetail | null>
}

let cached: LinkedInAdapter | null | undefined

/** The adapter, or null when not installed. */
export function loadLinkedIn(): LinkedInAdapter | null {
  if (cached !== undefined) return cached

  try {
    const file = path.join(process.cwd(), 'private', 'linkedin.cjs')
    const req = createRequire(path.join(process.cwd(), 'index.js'))
    const mod = req(file) as LinkedInAdapter
    cached = typeof mod?.searchJobs === 'function' ? mod : null
  } catch {
    cached = null   // absent or broken: a missing optional source, not an error
  }
  return cached
}

export function isLinkedInAvailable(): boolean {
  return loadLinkedIn() !== null
}
