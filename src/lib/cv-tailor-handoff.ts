'use client'
// Hands a job from Job Search to the CV Builder.
//
// Job Search writes the request and navigates; the CV Builder takes it on
// mount and starts curating straight away. "Take" reads and removes in one
// step, so a reload of the CV Builder (or React running an effect twice in
// development) never generates the same CV a second time.

export interface CvTailorRequest {
  role: string
  company: string
  job_description: string
  /** Back-links shown above the tailored CV. */
  jobUrl?: string
  source?: string
}

const KEY = 'hirekit:cvTailorRequest'

/** The CV builder needs a real description to tailor against. A job card's
 *  one-line location or title is not one, so anything this short sends the
 *  user to the pre-filled form to paste the posting instead. */
export const MIN_DESCRIPTION_CHARS = 120

export function requestCvTailor(req: CvTailorRequest) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(req)) } catch { /* storage blocked */ }
}

export function takeCvTailorRequest(): CvTailorRequest | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(KEY)
    const r = JSON.parse(raw) as CvTailorRequest
    return typeof r?.role === 'string' ? r : null
  } catch {
    return null
  }
}
