// Server-side helpers for publishing projects to a user's portfolio.
//
// The portfolio reads a read-only feed at /api/public/portfolio/<token>.
// The token is random, shown to the owner once, and stored only as a hash,
// so a database leak does not expose working feed links. When published
// projects change, HireKit calls the portfolio host's deploy hook so the
// site rebuilds with the new list.
//
// Server-only: imported from API routes.

import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_PREFIX = 'hkpf_'

export function newFeedToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Where the feed is served from. The portfolio's build calls this, so it
 *  must be the deployed app, not the desktop shell's loopback address. */
export function feedBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://hirekit-pearl.vercel.app').replace(/\/+$/, '')
  return `${base}/api/public/portfolio/`
}

// ── Deploy hooks ──────────────────────────────────────────────────
// Only the hosts' own hook endpoints: the URL is user-supplied and fetched
// from the server, so an open list would let anyone make HireKit request
// arbitrary addresses (SSRF).
const HOOK_HOSTS = new Set(['api.vercel.com', 'api.netlify.com', 'api.cloudflare.com', 'api.render.com'])

// error on both arms: tsconfig is not strict, so callers cannot narrow.
type Checked<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined }

export function validateDeployHook(raw: string): Checked<string> {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return { ok: false, error: 'Deploy hook must be a full URL.' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'Deploy hook must use https.' }
  if (!HOOK_HOSTS.has(u.hostname)) {
    return { ok: false, error: `Deploy hook must be a Vercel, Netlify, Cloudflare Pages or Render hook (${Array.from(HOOK_HOSTS).join(', ')}).` }
  }
  return { ok: true, value: u.toString() }
}

export function validateSiteUrl(raw: string): Checked<string | null> {
  const s = raw.trim()
  if (!s) return { ok: true, value: null }
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`) } catch { return { ok: false, error: 'Enter your portfolio address, e.g. https://you.vercel.app' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Portfolio address must be http(s).' }
  return { ok: true, value: u.origin }
}

/** Several edits in a row (reordering, toggling) should cost one rebuild,
 *  not one each. Within this window after a rebuild, further changes are
 *  left for the next one or the "Rebuild now" button. */
const REBUILD_THROTTLE_MS = 90 * 1000

/**
 * Calls the user's deploy hook, if they set one. Never throws: publishing a
 * project must not fail because the portfolio host is slow. The outcome is
 * recorded on the connection so the Projects page can show it.
 */
export async function triggerPortfolioRebuild(
  supabase: SupabaseClient,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ triggered: boolean; status: string }> {
  const { data: conn } = await supabase
    .from('portfolio_connections')
    .select('deploy_hook_url, last_rebuild_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!conn?.deploy_hook_url) return { triggered: false, status: 'no deploy hook' }
  const last = conn.last_rebuild_at ? new Date(conn.last_rebuild_at).getTime() : 0
  if (!opts.force && Date.now() - last < REBUILD_THROTTLE_MS) {
    return { triggered: false, status: 'throttled' }
  }

  // Re-validate on use: a row written before the allow-list existed, or
  // edited directly, must not turn this into an open request.
  const hook = validateDeployHook(conn.deploy_hook_url)
  let status: string
  if (!hook.ok) {
    status = 'invalid deploy hook'
  } else {
    try {
      const res = await fetch(hook.value, { method: 'POST', signal: AbortSignal.timeout(8000), cache: 'no-store' })
      status = res.ok ? 'started' : `host answered ${res.status}`
    } catch (err) {
      status = `failed: ${err instanceof Error ? err.message : 'network error'}`
    }
  }

  await supabase
    .from('portfolio_connections')
    .update({ last_rebuild_at: new Date().toISOString(), last_rebuild_status: status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  return { triggered: hook.ok && status === 'started', status }
}

// ── Feed shape ────────────────────────────────────────────────────

export interface FeedProject {
  id: string
  title: string
  blurb: string | null
  description: string | null
  category: string | null
  stack: string[]
  live: string | null
  repo: string | null
  docs: string | null
  image: string | null
  year: string | null
  pinned: boolean
}

export interface PortfolioFeed {
  version: 1
  generatedAt: string
  categories: string[]
  /** Pinned first in the owner's order, then published, newest first. */
  projects: FeedProject[]
}
