// What this particular deployment can actually do.
//
// The same codebase runs in two places with different powers: the desktop
// shell owns a machine (persistent processes, a real browser, local files),
// a hosted deployment does not. Features are gated on these flags rather than
// removed, so the desktop build keeps them and the hosted one simply does not
// offer them.
//
// Server-side only — read via GET /api/capabilities from the client.
import { isLinkedInAvailable, linkedInLoadError } from './optional-linkedin'

export interface Capabilities {
  /** Running inside the desktop shell rather than a hosted deployment. */
  desktop: boolean
  /** Needs a browser process that outlives a request; desktop only. */
  whatsapp: boolean
  /** Optional private job-source adapter is installed. */
  linkedinSearch: boolean
  /** Gmail credentials are set, so cover letters and job-alert digests can
   *  be emailed. A property of the server, not of the user's account. */
  email: boolean
  /** Human-readable reason per disabled capability, for the UI to show. */
  reasons: Partial<Record<'whatsapp' | 'linkedinSearch' | 'email', string>>
}

/** Set by the desktop shell (see desktop/hirekit.c). */
export function isDesktop(): boolean {
  return process.env.HIREKIT_DESKTOP === '1'
}

/**
 * Whether this process outlives a single request.
 *
 * The actual requirement for WhatsApp is a browser that stays open between
 * calls, which rules out serverless functions but holds for anything
 * self-hosted — the desktop shell, `next dev`, `next start` on a VPS. Testing
 * against the known serverless hosts rather than against the desktop marker
 * keeps the feature working in local development, where it does work.
 */
export function hasPersistentProcess(): boolean {
  if (isDesktop()) return true
  const serverless = process.env.VERCEL || process.env.NETLIFY
    || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTIONS_WORKER_RUNTIME
  return !serverless
}

export function getCapabilities(): Capabilities {
  const desktop = isDesktop()
  const persistent = hasPersistentProcess()

  // Static import: this module always exists. Only the private file it loads
  // is optional, and that is handled inside it. A require() in a try/catch
  // here does not survive bundling and reported "not installed" even when it
  // was.
  const linkedinSearch = isLinkedInAvailable()

  const reasons: Capabilities['reasons'] = {}
  if (!persistent) {
    reasons.whatsapp =
      'WhatsApp needs a browser session that stays open between requests, which a serverless deployment cannot provide. Use the desktop app.'
  }
  if (!linkedinSearch) {
    // Says WHY, not just "unavailable" — "not installed" and "installed but
    // failed to load" need different fixes and look identical otherwise.
    reasons.linkedinSearch =
      linkedInLoadError() ?? 'Optional adapter not installed in this deployment.'
  }

  const email = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  if (!email) {
    reasons.email = 'GMAIL_USER and GMAIL_APP_PASSWORD are not set on this server, so nothing can be emailed.'
  }

  return { desktop, whatsapp: persistent, linkedinSearch, email, reasons }
}
