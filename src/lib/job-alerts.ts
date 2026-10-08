// Job alerts: saved searches re-run on a schedule (daily, from Vercel Cron)
// and on demand ("Check now"), so a new opening is announced once, in the
// bell, the alerts panel and optionally by email.
//
// A match is identified by the job's id, and job_alert_matches has one row
// per (alert, job). Recording is an insert that ignores rows already there,
// so whatever comes back from it is exactly what is new. Server-only.

import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseSearchParams, describeSearch } from './job-search-params'
import { runJobSearch } from './job-search-run'
import { SOURCE_LABELS, type JobSourceId } from './job-sources'

export const MAX_ALERTS_PER_USER = 10
/** Matches kept per run: a broad alert should not write hundreds of rows. */
const MAX_MATCHES_PER_RUN = 100

export interface AlertRow {
  id: string
  user_id: string
  name: string
  params: string
  email?: boolean
}

export interface NewMatch {
  title: string
  company: string | null
  location: string | null
  url: string
  source: string | null
  posted: string | null
}

/**
 * Runs one alert's search and records what it found.
 * baseline: the first run, when the alert is created — everything already
 * open is recorded as seen, so only postings that appear later are "new".
 */
export async function checkAlert(
  db: SupabaseClient,
  alert: AlertRow,
  opts: { baseline?: boolean } = {},
): Promise<{ newMatches: NewMatch[]; total: number; error?: string }> {
  const parsed = parseSearchParams(new URLSearchParams(alert.params))
  if (!parsed.ok) {
    await db.from('job_alerts').update({ last_checked_at: new Date().toISOString(), last_error: parsed.error }).eq('id', alert.id)
    return { newMatches: [], total: 0, error: parsed.error }
  }

  try {
    const result = await runJobSearch(parsed.value)
    const rows = result.data.slice(0, MAX_MATCHES_PER_RUN).map(j => ({
      alert_id: alert.id,
      user_id: alert.user_id,
      job_key: j.id.slice(0, 500),
      title: j.title.slice(0, 300),
      company: j.company?.slice(0, 200) ?? null,
      location: j.location?.slice(0, 200) ?? null,
      url: j.url,
      source: j.source,
      posted: j.date,
      seen: !!opts.baseline,
    }))

    let inserted: NewMatch[] = []
    if (rows.length) {
      const { data, error } = await db
        .from('job_alert_matches')
        .upsert(rows, { onConflict: 'alert_id,job_key', ignoreDuplicates: true })
        .select('title, company, location, url, source, posted')
      if (error) throw error
      inserted = (data ?? []) as NewMatch[]
    }

    await db.from('job_alerts').update({ last_checked_at: new Date().toISOString(), last_error: null }).eq('id', alert.id)
    return { newMatches: opts.baseline ? [] : inserted, total: rows.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Check failed'
    await db.from('job_alerts').update({ last_checked_at: new Date().toISOString(), last_error: msg.slice(0, 300) }).eq('id', alert.id)
    return { newMatches: [], total: 0, error: msg }
  }
}

export function alertNameFor(params: string): string {
  const p = parseSearchParams(new URLSearchParams(params))
  return p.ok ? describeSearch(p.value) : 'Job alert'
}

// ── Email ─────────────────────────────────────────────────────────

/** Same Gmail credentials the cover-letter sender uses; absent means alerts
 *  are bell-and-panel only. */
export function emailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** One email per user per run, grouping every alert that found something. */
export async function sendAlertDigest(to: string, groups: { name: string; matches: NewMatch[] }[]): Promise<void> {
  if (!emailConfigured() || !groups.length) return
  const total = groups.reduce((n, g) => n + g.matches.length, 0)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;color:#101828">
    <h2 style="font-size:18px;margin:0 0 4px">${total} new job${total === 1 ? '' : 's'} for your alerts</h2>
    <p style="color:#667085;font-size:13px;margin:0 0 18px">Found by HireKit since your last check.</p>
    ${groups.map(g => `
      <h3 style="font-size:14px;margin:18px 0 8px;color:#5C3EE8">${esc(g.name)}</h3>
      ${g.matches.slice(0, 25).map(m => `
        <p style="margin:0 0 10px;font-size:13px;line-height:1.5">
          <a href="${esc(m.url)}" style="color:#101828;font-weight:bold;text-decoration:none">${esc(m.title)}</a><br>
          <span style="color:#667085">${esc([m.company, m.location, m.source ? SOURCE_LABELS[m.source as JobSourceId] ?? m.source : null].filter(Boolean).join(' · '))}</span>
        </p>`).join('')}
      ${g.matches.length > 25 ? `<p style="font-size:12px;color:#667085">…and ${g.matches.length - 25} more.</p>` : ''}
    `).join('')}
    ${appUrl ? `<p style="margin-top:24px;font-size:12px"><a href="${appUrl}/job-search" style="color:#5C3EE8">Open Job Search</a> to manage your alerts.</p>` : ''}
  </div>`

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  })
  await transport.sendMail({
    from: `HireKit <${process.env.GMAIL_USER}>`,
    to,
    subject: `${total} new job${total === 1 ? '' : 's'}: ${groups.map(g => g.name.split(' · ')[0]).join(', ').slice(0, 80)}`,
    html,
  })
}
